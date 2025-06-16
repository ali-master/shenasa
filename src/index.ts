import "zod-openapi/extend";

import { Hono } from "hono";
import { cors } from "hono/cors";
import { etag } from "hono/etag";
import { logger } from "hono/logger";
import { showRoutes } from "hono/dev";
import { timeout } from "hono/timeout";
import { compress } from "hono/compress";
import { requestId } from "hono/request-id";
import { secureHeaders } from "hono/secure-headers";
import { trimTrailingSlash } from "hono/trailing-slash";
import { describeRoute, openAPISpecs } from "hono-openapi";
import { resolver, validator as zValidator } from "hono-openapi/zod";
import { Scalar } from "@scalar/hono-api-reference";

// Utils
import {
	prismaClient,
	createUniqueId,
	secureHeadersConfig,
	createRateLimiter,
	rateLimitTiers,
	CacheManager,
	MetricsCollector,
	ApiKeyManager,
} from "./utils";

// Exceptions
import { HttpTimeoutException } from "./exceptions";

// Schemas
import {
	exceptionSchema,
	getGenderByNameResponseSchema,
	getGenderByNameRequestParamsSchema,
	metricsResponseSchema,
	analyticsRequestSchema,
	analyticsResponseSchema,
	healthCheckResponseSchema,
	batchRequestSchema,
	batchResponseSchema,
	apiKeyCreateSchema,
	apiKeyResponseSchema,
} from "./schema";

type Bindings = {
	DB: D1Database;
};

type Variables = {
	requestStart: number;
	apiKey?: string;
	rateLimitTier: keyof typeof rateLimitTiers;
};

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>({
	strict: true,
}).basePath("/api/v1");

// Initialize utilities
let cache: CacheManager;
let metrics: MetricsCollector;
let apiKeyManager: ApiKeyManager;

// Middleware to initialize services
app.use("*", async (c, next) => {
	const db = await prismaClient.fetch(c.env.DB);
	if (!cache) cache = new CacheManager(db, { prefix: "shenasa" });
	if (!metrics) metrics = new MetricsCollector(db);
	if (!apiKeyManager) apiKeyManager = new ApiKeyManager(db);

	c.set("requestStart", Date.now());
	await next();
});

// API Key authentication middleware
app.use("*", async (c, next) => {
	const apiKey = c.req.header("x-api-key");
	let tier: keyof typeof rateLimitTiers = "FREE";

	if (apiKey) {
		const validation = await apiKeyManager.validateApiKey(apiKey);
		if (!validation.isValid) {
			return c.json(
				{
					code: 40101,
					message: "Invalid or expired API key",
				},
				401,
			);
		}

		c.set("apiKey", apiKey);
		tier = validation.apiKey!.tier as keyof typeof rateLimitTiers;
		await apiKeyManager.incrementUsage(apiKey);
	}

	c.set("rateLimitTier", tier);
	await next();
});

// Rate limiting middleware
app.use(
	"*",
	createRateLimiter({
		windowMs: 3600000, // 1 hour
		max: 100, // Default for free tier
		keyGenerator: (c) => {
			const tier = c.get("rateLimitTier");
			const apiKey = c.get("apiKey");

			// Dynamic rate limiting based on tier
			const limit = rateLimitTiers[tier as keyof typeof rateLimitTiers].requests;
			(c as any).rateLimitMax = limit;

			return apiKey ? `api:${apiKey}` : `ip:${c.req.header("cf-connecting-ip") || "unknown"}`;
		},
	}),
);

// OpenAPI documentation
app.get(
	"/openapi",
	openAPISpecs(app, {
		documentation: {
			info: {
				title: "Shenasa API",
				version: "2.0.0",
				description: "Advanced Persian name gender detection API with enterprise features",
			},
			servers: [
				{ url: "http://localhost:8787", description: "Local Server" },
				{ url: "https://shenasa.usestrict.dev", description: "Production Server" },
			],
			components: {
				securitySchemes: {
					ApiKeyAuth: {
						type: "apiKey",
						in: "header",
						name: "x-api-key",
					},
				},
			},
		},
	}),
);

app.get(
	"/docs",
	Scalar({
		url: "/api/v1/openapi",
		pageTitle: "Shenasa API Documentation",
	}),
);

// CORS and other middleware
app.use(
	"*",
	cors({
		allowHeaders: [
			"Content-Type",
			"Accept",
			"Origin",
			"X-Requested-With",
			"Cache-Control",
			"ETag",
			"Vary",
			"If-None-Match",
			"X-API-Key",
		],
		allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
		credentials: true,
		exposeHeaders: [
			"Content-Type",
			"Accept",
			"Origin",
			"X-Requested-With",
			"Cache-Control",
			"ETag",
			"Vary",
			"If-None-Match",
			"X-RateLimit-Limit",
			"X-RateLimit-Remaining",
			"X-RateLimit-Reset",
		],
		maxAge: 86400,
		origin: "*",
	}),
);

app.use(logger());
app.use(etag({ weak: false }));
app.use(compress({ encoding: "deflate", threshold: 1024 }));
app.use(
	requestId({
		generator: () => createUniqueId(),
		headerName: "X-Request-Id",
	}),
);

// Security and timeout middleware
app.use(trimTrailingSlash());
app.use(timeout(10_000, HttpTimeoutException));
app.use(secureHeaders(secureHeadersConfig));

// Health check endpoint
app.get(
	"/health",
	describeRoute({
		description: "Health check endpoint with system status",
		responses: {
			200: {
				description: "System health status",
				content: {
					"application/json": { schema: resolver(healthCheckResponseSchema) },
				},
			},
		},
	}),
	async (c) => {
		const startTime = Date.now();
		const db = await prismaClient.fetch(c.env.DB);

		// Database health check
		let dbStatus: "pass" | "fail" = "pass";
		let dbResponseTime = 0;
		try {
			const dbStart = Date.now();
			await db.persianName.findFirst();
			dbResponseTime = Date.now() - dbStart;
		} catch {
			dbStatus = "fail";
		}

		// Cache health check
		let cacheStatus: "pass" | "fail" = "pass";
		let cacheResponseTime = 0;
		try {
			const cacheStart = Date.now();
			await cache.get("health-check");
			cacheResponseTime = Date.now() - cacheStart;
		} catch {
			cacheStatus = "fail";
		}

		// Memory usage (simulated for edge environment)
		const memoryUsage = Math.random() * 100;
		const memoryStatus: "pass" | "fail" = memoryUsage < 90 ? "pass" : "fail";

		const overallStatus =
			dbStatus === "pass" && cacheStatus === "pass" && memoryStatus === "pass"
				? "healthy"
				: dbStatus === "fail"
					? "unhealthy"
					: "degraded";

		return c.json({
			status: overallStatus,
			timestamp: new Date().toISOString(),
			version: "2.0.0",
			uptime: Date.now() - startTime,
			checks: {
				database: { status: dbStatus, responseTime: dbResponseTime },
				cache: { status: cacheStatus, responseTime: cacheResponseTime },
				memory: { status: memoryStatus, usage: memoryUsage },
			},
		});
	},
);

// Metrics endpoint
app.get(
	"/metrics",
	describeRoute({
		description: "Get system metrics and usage statistics",
		security: [{ ApiKeyAuth: [] }],
		responses: {
			200: {
				description: "System metrics",
				content: {
					"application/json": { schema: resolver(metricsResponseSchema) },
				},
			},
		},
	}),
	async (c) => {
		const tier = c.get("rateLimitTier");
		if (tier === "FREE") {
			return c.json(
				{
					code: 40301,
					message: "Metrics access requires a paid API key",
				},
				403,
			);
		}

		const metricsData = await metrics.getMetrics(7);
		return c.json(metricsData);
	},
);

// Analytics endpoint
app.get(
	"/analytics",
	describeRoute({
		description: "Get advanced analytics and insights",
		security: [{ ApiKeyAuth: [] }],
		responses: {
			200: {
				description: "Analytics data",
				content: {
					"application/json": { schema: resolver(analyticsResponseSchema) },
				},
			},
		},
	}),
	zValidator("query", analyticsRequestSchema, (result, ctx) => {
		if (!result.success) {
			return ctx.json(
				{
					code: 40001,
					message: result.error.issues?.[0]?.message || "Validation error",
				},
				400,
			);
		}
	}),
	async (c) => {
		const tier = c.get("rateLimitTier");
		if (tier === "FREE" || tier === "BASIC") {
			return c.json(
				{
					code: 40302,
					message: "Analytics access requires Premium or Enterprise API key",
				},
				403,
			);
		}

		const { startDate, endDate, limit } = c.req.valid("query");
		const analyticsData = await metrics.getAnalytics(
			startDate ? new Date(startDate) : undefined,
			endDate ? new Date(endDate) : undefined,
			limit,
		);

		return c.json(analyticsData);
	},
);

// Batch processing endpoint
app.post(
	"/batch",
	describeRoute({
		description: "Process multiple names in a single request",
		security: [{ ApiKeyAuth: [] }],
		responses: {
			200: {
				description: "Batch processing results",
				content: {
					"application/json": { schema: resolver(batchResponseSchema) },
				},
			},
		},
	}),
	zValidator("json", batchRequestSchema, (result, ctx) => {
		if (!result.success) {
			return ctx.json(
				{
					code: 40001,
					message: result.error.issues?.[0]?.message || "Validation error",
				},
				400,
			);
		}
	}),
	async (c) => {
		const tier = c.get("rateLimitTier");
		if (tier === "FREE") {
			return c.json(
				{
					code: 40303,
					message: "Batch processing requires a paid API key",
				},
				403,
			);
		}

		const { names, includePopularity } = c.req.valid("json");
		const startTime = Date.now();
		const db = await prismaClient.fetch(c.env.DB);

		const results = [];
		let errorCount = 0;

		for (const name of names) {
			try {
				const cached = await cache.get<any>(`name:${name}`);
				if (cached) {
					results.push({
						name,
						gender: cached.gender,
						enName: cached.enName,
						popularity: includePopularity ? cached.popularity : undefined,
						confidence: 1.0,
					});
					continue;
				}

				const data = await db.persianName.findFirst({
					where: { name: { equals: name } },
					select: {
						gender: true,
						enName: true,
						popularity: includePopularity,
					},
				});

				if (data) {
					results.push({
						name,
						gender: data.gender,
						enName: data.enName,
						popularity: includePopularity ? data.popularity : undefined,
						confidence: 0.95,
					});

					await cache.set(`name:${name}`, data, 3600);
				} else {
					results.push({
						name,
						gender: null,
						enName: null,
						popularity: includePopularity ? 0 : undefined,
						confidence: 0.0,
					});
				}
			} catch {
				errorCount++;
				results.push({
					name,
					gender: null,
					enName: null,
					popularity: includePopularity ? 0 : undefined,
					confidence: 0.0,
				});
			}
		}

		const processingTime = Date.now() - startTime;

		return c.json({
			results,
			processedCount: names.length,
			errorCount,
			processingTime,
		});
	},
);

// API Key management
app.post(
	"/admin/api-keys",
	describeRoute({
		description: "Create a new API key (Admin only)",
		responses: {
			201: {
				description: "API key created",
				content: {
					"application/json": { schema: resolver(apiKeyResponseSchema) },
				},
			},
		},
	}),
	zValidator("json", apiKeyCreateSchema, (result, ctx) => {
		if (!result.success) {
			return ctx.json(
				{
					code: 40001,
					message: result.error.issues?.[0]?.message || "Validation error",
				},
				400,
			);
		}
	}),
	async (c) => {
		// Simple admin authentication (in production, use proper auth)
		const adminKey = c.req.header("x-admin-key");
		if (adminKey !== "admin-secret-key") {
			return c.json(
				{
					code: 40101,
					message: "Admin access required",
				},
				401,
			);
		}

		const { name, tier } = c.req.valid("json");
		const apiKey = await apiKeyManager.createApiKey(name, tier);

		return c.json(
			{
				...apiKey,
				requestCount: 0,
				isActive: true,
				createdAt: new Date().toISOString(),
				lastUsedAt: null,
			},
			201,
		);
	},
);

// Main name lookup endpoint
app.get(
	"name/:name?",
	describeRoute({
		description: "Returns the gender and english name of a Persian name with enhanced features",
		responses: {
			200: {
				description: "Successful response",
				content: {
					"application/json": { schema: resolver(getGenderByNameResponseSchema) },
				},
			},
			400: {
				description: "Bad request",
				content: {
					"application/json": { schema: resolver(exceptionSchema) },
				},
			},
		},
	}),
	zValidator("param", getGenderByNameRequestParamsSchema, (result, ctx) => {
		if (!result.success) {
			const code = {
				invalid_type: 40001,
				too_small: 40002,
				too_big: 40003,
			};

			return ctx.json(
				{
					code: code[result.error.issues?.[0]?.code as keyof typeof code] || 40001,
					message: result.error.issues?.[0]?.message || "Validation error",
				},
				400,
			);
		}
	}),
	async (c) => {
		const requestStart = c.get("requestStart");
		const name = c.req.param("name");
		const apiKey = c.get("apiKey");

		// Check cache first
		const cached = await cache.get<any>(`name:${name}`);
		if (cached) {
			return c.json(cached);
		}

		const db = await prismaClient.fetch(c.env.DB);
		const data = await db.persianName.findFirst({
			where: { name: { equals: name } },
			select: {
				id: true,
				gender: true,
				enName: true,
			},
		});

		const responseTime = Date.now() - requestStart;

		// Log request for metrics
		await metrics.logRequest({
			persianNameId: data?.id,
			requestedName: name || "",
			ipAddress: c.req.header("cf-connecting-ip"),
			userAgent: c.req.header("user-agent"),
			responseTime,
			statusCode: 200,
			apiKey,
		});

		const result = data
			? { gender: data.gender, enName: data.enName }
			: { gender: null, enName: null };

		// Cache the result
		await cache.set(`name:${name}`, result, 3600);

		return c.json(result, 200);
	},
);

// Cache warming endpoint
app.post(
	"/admin/cache/warm",
	describeRoute({
		description: "Warm the cache with popular names (Admin only)",
		responses: {
			200: {
				description: "Cache warmed successfully",
			},
		},
	}),
	async (c) => {
		const adminKey = c.req.header("x-admin-key");
		if (adminKey !== "admin-secret-key") {
			return c.json(
				{
					code: 40101,
					message: "Admin access required",
				},
				401,
			);
		}

		await cache.warmCache();
		return c.json({ message: "Cache warmed successfully" });
	},
);

showRoutes(app, {
	colorize: true,
	verbose: false,
});

export default app;
