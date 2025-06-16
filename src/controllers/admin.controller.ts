import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { resolver, validator as zValidator } from "hono-openapi/zod";

import { apiKeyCreateSchema, apiKeyResponseSchema, exceptionSchema } from "../schema";
import { ApiKeyManager, CacheManager } from "../utils";

type Bindings = {
	DB: D1Database;
	ADMIN_SECRET_KEY?: string;
};

type Variables = {
	apiKeyManager: ApiKeyManager;
	cache: CacheManager;
	logger: any;
};

export const adminController = new Hono<{ Bindings: Bindings; Variables: Variables }>();

/**
 * POST /admin/api-keys - Create API key endpoint
 * Create a new API key with specified tier
 */
adminController.post(
	"/api-keys",
	describeRoute({
		tags: ["Admin"],
		summary: "Create API key",
		description: `
Create a new API key with specified name and tier for user access management.

**Admin Authentication:**
Requires admin access key in \`x-admin-key\` header for security.

**API Key Tiers:**
- \`FREE\`: 100 requests/hour, basic features only
- \`BASIC\`: 1,000 requests/hour, includes batch processing and metrics
- \`PREMIUM\`: 10,000 requests/hour, includes analytics and priority support
- \`ENTERPRISE\`: 100,000 requests/hour, includes all features and SLA

**Features:**
- Secure CUID2-based key generation
- Automatic usage tracking and quota management
- Key activation and deactivation capabilities
- Comprehensive audit logging
`,
		security: [{ AdminAuth: [] }],
		requestBody: {
			required: true,
			content: {
				"application/json": {
					schema: resolver(apiKeyCreateSchema),
					examples: {
						basic: {
							summary: "Basic tier API key",
							description: "Create a basic tier API key for a user",
							value: {
								name: "John Doe - Development",
								tier: "BASIC",
							},
						},
						premium: {
							summary: "Premium tier API key",
							description: "Create a premium tier API key for enterprise use",
							value: {
								name: "Acme Corp - Production",
								tier: "PREMIUM",
							},
						},
						enterprise: {
							summary: "Enterprise tier API key",
							description: "Create an enterprise tier API key with full access",
							value: {
								name: "Global Systems Inc - Enterprise",
								tier: "ENTERPRISE",
							},
						},
					},
				},
			},
		},
		responses: {
			201: {
				description: "API key created successfully",
				content: {
					"application/json": {
						schema: resolver(apiKeyResponseSchema),
						examples: {
							success: {
								summary: "Successfully created API key",
								description: "New API key created and ready for use",
								value: {
									id: "api_2Z4LxDGpJf1r2X8YqN3KmH5vT6",
									key: "sk_test_2Z4LxDGpJf1r2X8YqN3KmH5vT6_mRpL9qW3eR5tY7uI",
									name: "John Doe - Development",
									tier: "BASIC",
									requestCount: 0,
									isActive: true,
									createdAt: "2024-06-16T12:00:00Z",
									lastUsedAt: null,
								},
							},
						},
					},
				},
				headers: {
					"X-Request-Id": {
						description: "Unique request identifier",
						schema: { type: "string" },
					},
					"X-API-Key-Created": {
						description: "Timestamp when API key was created",
						schema: { type: "string" },
					},
				},
			},
			400: {
				description: "Bad request - Invalid input data",
				content: {
					"application/json": {
						schema: resolver(exceptionSchema),
						examples: {
							validation: {
								summary: "Validation error",
								value: {
									code: 40001,
									message: "Name must be between 3 and 100 characters",
								},
							},
							invalidTier: {
								summary: "Invalid tier",
								value: {
									code: 40001,
									message: "Tier must be one of: FREE, BASIC, PREMIUM, ENTERPRISE",
								},
							},
						},
					},
				},
			},
			401: {
				description: "Unauthorized - Invalid admin key",
				content: {
					"application/json": {
						schema: resolver(exceptionSchema),
						examples: {
							unauthorized: {
								summary: "Admin access required",
								value: {
									code: 40101,
									message: "Admin access required",
								},
							},
							missingKey: {
								summary: "Missing admin key",
								value: {
									code: 40101,
									message: "Admin authentication key required in x-admin-key header",
								},
							},
						},
					},
				},
			},
			500: {
				description: "Internal server error",
				content: {
					"application/json": {
						schema: resolver(exceptionSchema),
						examples: {
							serverError: {
								summary: "API key creation failed",
								value: {
									code: 50001,
									message: "Failed to create API key",
								},
							},
						},
					},
				},
			},
		},
	}),
	zValidator("json", apiKeyCreateSchema, (result, ctx) => {
		if (!result.success) {
			const issue = result.error.issues?.[0];
			return ctx.json(
				{
					code: 40001,
					message: issue?.message || "Validation error",
				},
				400,
			);
		}
	}),
	async (c) => {
		try {
			// Admin authentication
			const adminKey = c.req.header("x-admin-key");
			const expectedAdminKey = c.env.ADMIN_SECRET_KEY || "admin-secret-key";

			if (!adminKey) {
				return c.json(
					{
						code: 40101,
						message: "Admin authentication key required in x-admin-key header",
					},
					401,
				);
			}

			if (adminKey !== expectedAdminKey) {
				return c.json(
					{
						code: 40101,
						message: "Admin access required",
					},
					401,
				);
			}

			const { name, tier } = c.req.valid("json");
			const apiKeyManager = c.get("apiKeyManager");
			const requestLogger = c.get("logger");

			// Create the API key
			requestLogger.info("Creating API key", { name, tier });
			const apiKey = await apiKeyManager.createApiKey(name, tier);
			requestLogger.info("API key created successfully", { keyId: apiKey.id, tier });

			// Add creation timestamp header
			c.header("X-API-Key-Created", new Date().toISOString());

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
		} catch (error) {
			const requestLogger = c.get("logger");
			const { name, tier } = c.req.valid("json") || { name: "unknown", tier: "unknown" };
			requestLogger.error("API key creation failed", error as Error, { name, tier });
			return c.json(
				{
					code: 50001,
					message: "Failed to create API key",
				},
				500,
			);
		}
	},
);

/**
 * POST /admin/cache/warm - Cache warming endpoint
 * Warm the cache with popular names
 */
adminController.post(
	"/cache/warm",
	describeRoute({
		tags: ["Admin"],
		summary: "Warm cache with popular names",
		description: `
Pre-populate the cache with the most popular Persian names to improve response times.

**Features:**
- Warms cache with top 1000 most popular names
- Improves response times for common queries
- Reduces database load during peak usage
- Returns warming statistics and performance metrics

**Usage:**
Typically run during maintenance windows or after cache invalidation to ensure optimal performance.
`,
		security: [{ AdminAuth: [] }],
		responses: {
			200: {
				description: "Cache warmed successfully",
				content: {
					"application/json": {
						schema: {
							type: "object",
							properties: {
								message: {
									type: "string",
									example: "Cache warmed successfully",
								},
								warmed: {
									type: "integer",
									description: "Number of entries warmed",
									example: 1000,
								},
								duration: {
									type: "integer",
									description: "Warming duration in milliseconds",
									example: 2340,
								},
								timestamp: {
									type: "string",
									format: "date-time",
									description: "When warming completed",
									example: "2024-06-16T12:00:00Z",
								},
							},
						},
						examples: {
							success: {
								summary: "Successful cache warming",
								value: {
									message: "Cache warmed successfully",
									warmed: 1000,
									duration: 2340,
									timestamp: "2024-06-16T12:00:00Z",
								},
							},
						},
					},
				},
				headers: {
					"X-Request-Id": {
						description: "Unique request identifier",
						schema: { type: "string" },
					},
					"X-Cache-Warmed": {
						description: "Timestamp when cache warming completed",
						schema: { type: "string" },
					},
				},
			},
			401: {
				description: "Unauthorized - Invalid admin key",
				content: {
					"application/json": {
						schema: resolver(exceptionSchema),
						examples: {
							unauthorized: {
								summary: "Admin access required",
								value: {
									code: 40101,
									message: "Admin access required",
								},
							},
						},
					},
				},
			},
			500: {
				description: "Internal server error",
				content: {
					"application/json": {
						schema: resolver(exceptionSchema),
						examples: {
							warmingFailed: {
								summary: "Cache warming failed",
								value: {
									code: 50001,
									message: "Cache warming failed",
								},
							},
						},
					},
				},
			},
		},
	}),
	async (c) => {
		try {
			// Admin authentication
			const adminKey = c.req.header("x-admin-key");
			const expectedAdminKey = c.env.ADMIN_SECRET_KEY || "admin-secret-key";

			if (!adminKey || adminKey !== expectedAdminKey) {
				return c.json(
					{
						code: 40101,
						message: "Admin access required",
					},
					401,
				);
			}

			const cache = c.get("cache");
			const startTime = Date.now();

			// Warm the cache
			await cache.warmCache();
			const duration = Date.now() - startTime;
			const timestamp = new Date().toISOString();

			// Add completion timestamp header
			c.header("X-Cache-Warmed", timestamp);

			return c.json({
				message: "Cache warmed successfully",
				warmed: 1000,
				duration,
				timestamp,
			});
		} catch (error) {
			const requestLogger = c.get("logger");
			requestLogger.error("Cache warming failed", error as Error);
			return c.json(
				{
					code: 50001,
					message: "Cache warming failed",
				},
				500,
			);
		}
	},
);
