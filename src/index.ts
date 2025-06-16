import "zod-openapi/extend";

import { Hono } from "hono";
import { cors } from "hono/cors";
import { etag } from "hono/etag";
import { showRoutes } from "hono/dev";
import { timeout } from "hono/timeout";
import { compress } from "hono/compress";
import { requestId } from "hono/request-id";
import { secureHeaders } from "hono/secure-headers";
import { trimTrailingSlash } from "hono/trailing-slash";
import { openAPISpecs } from "hono-openapi";
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
	logger as customLogger,
	createLoggerMiddleware,
} from "./utils";

// Exceptions
import { HttpTimeoutException } from "./exceptions";

// Controllers
import {
	nameController,
	batchController,
	metricsController,
	analyticsController,
	adminController,
	healthController,
} from "./controllers";

// OpenAPI Documentation
import { openAPIConfig } from "./docs/openapi";

type Bindings = {
	DB: D1Database;
	ADMIN_SECRET_KEY?: string;
};

type Variables = {
	requestStart: number;
	apiKey?: string;
	rateLimitTier: keyof typeof rateLimitTiers;
	cache: CacheManager;
	metrics: MetricsCollector;
	apiKeyManager: ApiKeyManager;
	logger: any;
};

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>({
	strict: true,
}).basePath("/api/v1");

// Initialize utilities
let cache: CacheManager;
let metrics: MetricsCollector;
let apiKeyManager: ApiKeyManager;

// Logger middleware (before other middleware)
app.use("*", createLoggerMiddleware());

// Middleware to initialize services
app.use("*", async (c, next) => {
	try {
		const db = await prismaClient.fetch(c.env.DB);
		if (!cache) {
			cache = new CacheManager(db, { prefix: "shenasa" });
			customLogger.info("Cache manager initialized");
		}
		if (!metrics) {
			metrics = new MetricsCollector(db);
			customLogger.info("Metrics collector initialized");
		}
		if (!apiKeyManager) {
			apiKeyManager = new ApiKeyManager(db);
			customLogger.info("API key manager initialized");
		}

		// Set variables for controllers
		c.set("requestStart", Date.now());
		c.set("cache", cache);
		c.set("metrics", metrics);
		c.set("apiKeyManager", apiKeyManager);
		await next();
	} catch (error) {
		customLogger.error("Failed to initialize services", error as Error);
		throw error;
	}
});

// API Key authentication middleware
app.use("*", async (c, next) => {
	const requestLogger = c.get("logger");
	const apiKey = c.req.header("x-api-key");
	let tier: keyof typeof rateLimitTiers = "FREE";

	if (apiKey) {
		try {
			const validation = await apiKeyManager.validateApiKey(apiKey);
			if (!validation.isValid) {
				requestLogger.warn("Invalid API key provided", { apiKey: apiKey.substring(0, 8) + "..." });
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
			requestLogger.debug("API key validated", { tier, keyId: validation.apiKey!.id });
		} catch (error) {
			requestLogger.error("API key validation failed", error as Error);
			return c.json(
				{
					code: 50001,
					message: "Internal server error",
				},
				500,
			);
		}
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
app.get("/openapi", openAPISpecs(app, openAPIConfig));

app.get(
	"/docs",
	Scalar({
		url: "/api/v1/openapi",
		pageTitle: "Shenasa API Documentation",
		theme: "elysiajs",
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

// Note: We're using our custom logger middleware instead of Hono's logger
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

// Route handlers
app.route("/health", healthController);

app.route("/metrics", metricsController);

app.route("/analytics", analyticsController);

app.route("/batch", batchController);

app.route("/admin", adminController);

app.route("/name", nameController);

showRoutes(app, {
	colorize: true,
	verbose: false,
});

export default app;
