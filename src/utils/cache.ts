import type { PrismaClient } from "@prisma/client";

export interface CacheOptions {
	ttl?: number; // Time to live in seconds
	prefix?: string;
}

export class CacheManager {
	private memoryCache = new Map<string, { value: any; expiresAt: number }>();
	private defaultTTL = 3600; // 1 hour

	constructor(
		private db: PrismaClient,
		private options: CacheOptions = {},
	) {}

	private getKey(key: string): string {
		return this.options.prefix ? `${this.options.prefix}:${key}` : key;
	}

	async get<T>(key: string): Promise<T | null> {
		const cacheKey = this.getKey(key);

		// Check memory cache first
		const memoryItem = this.memoryCache.get(cacheKey);
		if (memoryItem && memoryItem.expiresAt > Date.now()) {
			return memoryItem.value as T;
		}

		// Check database cache
		try {
			const dbItem = await this.db.cacheEntry.findUnique({
				where: { key: cacheKey },
			});

			if (dbItem && dbItem.expiresAt > new Date()) {
				const value = JSON.parse(dbItem.value);
				// Store in memory cache
				this.memoryCache.set(cacheKey, {
					value,
					expiresAt: dbItem.expiresAt.getTime(),
				});
				return value as T;
			}
		} catch (error) {
			console.error("Cache get error:", error);
		}

		return null;
	}

	async set<T>(key: string, value: T, ttl?: number): Promise<void> {
		const cacheKey = this.getKey(key);
		const expiresAt = new Date(Date.now() + (ttl || this.defaultTTL) * 1000);
		const serializedValue = JSON.stringify(value);

		// Store in memory cache
		this.memoryCache.set(cacheKey, {
			value,
			expiresAt: expiresAt.getTime(),
		});

		// Store in database cache
		try {
			await this.db.cacheEntry.upsert({
				where: { key: cacheKey },
				update: {
					value: serializedValue,
					expiresAt,
				},
				create: {
					key: cacheKey,
					value: serializedValue,
					expiresAt,
				},
			});
		} catch (error) {
			console.error("Cache set error:", error);
		}
	}

	async delete(key: string): Promise<void> {
		const cacheKey = this.getKey(key);

		// Remove from memory cache
		this.memoryCache.delete(cacheKey);

		// Remove from database cache
		try {
			await this.db.cacheEntry.delete({
				where: { key: cacheKey },
			});
		} catch (error) {
			console.error("Cache delete error:", error);
		}
	}

	async clear(): Promise<void> {
		// Clear memory cache
		this.memoryCache.clear();

		// Clear database cache
		try {
			await this.db.cacheEntry.deleteMany({});
		} catch (error) {
			console.error("Cache clear error:", error);
		}
	}

	async cleanExpired(): Promise<void> {
		const now = Date.now();

		// Clean memory cache
		for (const [key, item] of this.memoryCache.entries()) {
			if (item.expiresAt <= now) {
				this.memoryCache.delete(key);
			}
		}

		// Clean database cache
		try {
			await this.db.cacheEntry.deleteMany({
				where: {
					expiresAt: {
						lte: new Date(),
					},
				},
			});
		} catch (error) {
			console.error("Cache cleanup error:", error);
		}
	}

	// Warm cache with popular names
	async warmCache(): Promise<void> {
		try {
			const popularNames = await this.db.persianName.findMany({
				orderBy: { popularity: "desc" },
				take: 100,
				select: {
					name: true,
					gender: true,
					enName: true,
					popularity: true,
				},
			});

			for (const name of popularNames) {
				await this.set(
					`name:${name.name}`,
					{
						gender: name.gender,
						enName: name.enName,
						popularity: name.popularity,
					},
					7200,
				); // 2 hours for popular names
			}
		} catch (error) {
			console.error("Cache warming error:", error);
		}
	}
}
