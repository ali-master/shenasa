import type { Context } from "hono";

export interface RateLimitConfig {
	windowMs: number;
	max: number;
	message?: string;
	keyGenerator?: (c: Context) => string;
}

export interface RateLimitStore {
	increment: (key: string) => Promise<{ totalHits: number; timeToExpire: number }>;
	decrement: (key: string) => Promise<void>;
	resetKey: (key: string) => Promise<void>;
}

export class MemoryStore implements RateLimitStore {
	private hits = new Map<string, { count: number; resetTime: number }>();

	async increment(key: string): Promise<{ totalHits: number; timeToExpire: number }> {
		const now = Date.now();
		const current = this.hits.get(key);

		if (!current || current.resetTime <= now) {
			this.hits.set(key, { count: 1, resetTime: now + 60000 }); // 1 minute window
			return { totalHits: 1, timeToExpire: 60000 };
		}

		current.count++;
		this.hits.set(key, current);

		return {
			totalHits: current.count,
			timeToExpire: current.resetTime - now,
		};
	}

	async decrement(key: string): Promise<void> {
		const current = this.hits.get(key);
		if (current && current.count > 0) {
			current.count--;
			this.hits.set(key, current);
		}
	}

	async resetKey(key: string): Promise<void> {
		this.hits.delete(key);
	}
}

export const rateLimitTiers = {
	FREE: { requests: 100, window: 3600000 }, // 100 per hour
	BASIC: { requests: 1000, window: 3600000 }, // 1000 per hour
	PREMIUM: { requests: 10000, window: 3600000 }, // 10k per hour
	ENTERPRISE: { requests: 100000, window: 3600000 }, // 100k per hour
} as const;

export function createRateLimiter(
	config: RateLimitConfig,
	store: RateLimitStore = new MemoryStore(),
) {
	return async (c: Context, next: () => Promise<void>) => {
		const key = config.keyGenerator ? config.keyGenerator(c) : getClientKey(c);
		const { totalHits, timeToExpire } = await store.increment(key);

		c.header("X-RateLimit-Limit", config.max.toString());
		c.header("X-RateLimit-Remaining", Math.max(0, config.max - totalHits).toString());
		c.header("X-RateLimit-Reset", new Date(Date.now() + timeToExpire).toISOString());

		if (totalHits > config.max) {
			c.header("Retry-After", Math.ceil(timeToExpire / 1000).toString());
			return c.json(
				{
					code: 42901,
					message: config.message || "Too many requests. Please try again later.",
				},
				429,
			);
		}

		await next();
	};
}

function getClientKey(c: Context): string {
	const apiKey = c.req.header("x-api-key");
	if (apiKey) return `api:${apiKey}`;

	const forwarded = c.req.header("cf-connecting-ip") || c.req.header("x-forwarded-for");
	const ip = forwarded ? forwarded.split(",")[0].trim() : "unknown";
	return `ip:${ip}`;
}
