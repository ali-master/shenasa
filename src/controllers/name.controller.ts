import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { resolver, validator as zValidator } from "hono-openapi/zod";

import {
	getGenderByNameResponseSchema,
	getGenderByNameRequestParamsSchema,
	exceptionSchema,
} from "../schema";
import { prismaClient, CacheManager, MetricsCollector } from "../utils";

type Bindings = {
	DB: D1Database;
};

type Variables = {
	requestStart: number;
	apiKey?: string;
	rateLimitTier: string;
	cache: CacheManager;
	metrics: MetricsCollector;
	logger: any;
};

export const nameController = new Hono<{ Bindings: Bindings; Variables: Variables }>();

/**
 * GET /name/:name - Main name lookup endpoint
 * Returns the gender and English name of a Persian name with enhanced features
 */
nameController.get(
	"/:name",
	describeRoute({
		tags: ["Name Lookup"],
		summary: "Get gender by Persian name",
		description: `Determines the gender of a Persian name and provides the English transliteration.
**Features:**
- High-accuracy gender detection for Persian names
- English name transliteration
- Multi-layer caching for optimal performance
- Request logging for analytics
- Support for common Persian name variations

**Caching:**
Results are cached for 1 hour to improve performance. Cache headers are included in the response.

**Analytics:**
All requests are logged for usage analytics (available in paid tiers).
`,
		parameters: [
			{
				name: "name",
				in: "path",
				required: true,
				description: "Persian name to analyze (supports Persian script)",
				schema: {
					type: "string",
					minLength: 1,
					maxLength: 50,
					pattern: "^[\\u0600-\\u06FF\\s]+$",
					example: "علی",
				},
			},
		],
		responses: {
			200: {
				description: "Successful response with gender information",
				content: {
					"application/json": {
						schema: resolver(getGenderByNameResponseSchema),
						examples: {
							male: {
								summary: "Male name",
								description: "Response for a male Persian name",
								value: {
									gender: "male",
									enName: "Ali",
								},
							},
							female: {
								summary: "Female name",
								description: "Response for a female Persian name",
								value: {
									gender: "female",
									enName: "Zahra",
								},
							},
							unknown: {
								summary: "Unknown name",
								description: "Response when name is not found in database",
								value: {
									gender: null,
									enName: null,
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
					ETag: {
						description: "Entity tag for caching",
						schema: { type: "string" },
					},
					"Cache-Control": {
						description: "Cache control header",
						schema: { type: "string" },
					},
					"X-RateLimit-Limit": {
						description: "Rate limit maximum",
						schema: { type: "integer" },
					},
					"X-RateLimit-Remaining": {
						description: "Rate limit remaining",
						schema: { type: "integer" },
					},
				},
			},
			400: {
				description: "Bad request - Invalid name format or validation error",
				content: {
					"application/json": {
						schema: resolver(exceptionSchema),
						examples: {
							validation: {
								summary: "Validation error",
								description: "Name validation failed",
								value: {
									code: 40001,
									message:
										"Name must be between 1 and 50 characters and contain only Persian characters",
								},
							},
							empty: {
								summary: "Empty name",
								description: "Name parameter is missing or empty",
								value: {
									code: 40002,
									message: "Name parameter is required",
								},
							},
						},
					},
				},
			},
			429: {
				description: "Rate limit exceeded",
				content: {
					"application/json": {
						schema: resolver(exceptionSchema),
						examples: {
							rateLimit: {
								summary: "Rate limit exceeded",
								value: {
									code: 42901,
									message: "Rate limit exceeded. Please try again later.",
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
								summary: "Server error",
								value: {
									code: 50001,
									message: "Internal server error",
								},
							},
						},
					},
				},
			},
		},
	}),
	zValidator("param", getGenderByNameRequestParamsSchema, (result, ctx) => {
		if (!result.success) {
			const errorCodes = {
				invalid_type: 40001,
				too_small: 40002,
				too_big: 40003,
			};

			const issue = result.error.issues?.[0];
			const code = errorCodes[issue?.code as keyof typeof errorCodes] || 40001;

			return ctx.json(
				{
					code,
					message: issue?.message || "Validation error",
				},
				400,
			);
		}
	}),
	async (c) => {
		try {
			const requestStart = c.get("requestStart");
			const name = c.req.param("name");
			const apiKey = c.get("apiKey");
			const cache = c.get("cache");
			const metrics = c.get("metrics");
			const requestLogger = c.get("logger");

			if (!name) {
				return c.json(
					{
						code: 40002,
						message: "Name parameter is required",
					},
					400,
				);
			}

			// Check cache first
			const cached = await cache.get<any>(`name:${name}`);
			if (cached) {
				// Add cache hit headers
				c.header("X-Cache", "HIT");
				c.header("Cache-Control", "public, max-age=3600");
				requestLogger.logCache("hit", `name:${name}`);
				return c.json(cached);
			}

			const dbStart = Date.now();
			const db = await prismaClient.fetch(c.env.DB);
			const data = await db.persianName.findFirst({
				where: { name: { equals: name } },
				select: {
					id: true,
					gender: true,
					enName: true,
				},
			});
			const dbDuration = Date.now() - dbStart;
			requestLogger.logDatabase("findFirst", "persianName", dbDuration);

			const responseTime = Date.now() - requestStart;

			// Log request for metrics
			await metrics.logRequest({
				persianNameId: data?.id,
				requestedName: name,
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
			requestLogger.logCache("set", `name:${name}`);

			// Add cache miss headers
			c.header("X-Cache", "MISS");
			c.header("Cache-Control", "public, max-age=3600");
			c.header("X-Response-Time", `${responseTime}ms`);

			requestLogger.info("Name lookup completed", { name, found: !!data, responseTime });
			return c.json(result, 200);
		} catch (error) {
			const requestLogger = c.get("logger");
			const name = c.req.param("name");
			requestLogger.error("Name lookup failed", error as Error, { name });
			return c.json(
				{
					code: 50001,
					message: "Internal server error",
				},
				500,
			);
		}
	},
);
