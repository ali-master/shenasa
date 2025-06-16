import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { resolver, validator as zValidator } from "hono-openapi/zod";

import { batchRequestSchema, batchResponseSchema, exceptionSchema } from "../schema";
import { prismaClient, CacheManager, rateLimitTiers } from "../utils";

type Bindings = {
	DB: D1Database;
};

type Variables = {
	requestStart: number;
	apiKey?: string;
	rateLimitTier: keyof typeof rateLimitTiers;
	cache: CacheManager;
	logger: any;
};

export const batchController = new Hono<{ Bindings: Bindings; Variables: Variables }>();

/**
 * POST /batch - Batch processing endpoint
 * Process multiple names in a single request
 */
batchController.post(
	"/",
	describeRoute({
		tags: ["Batch Processing"],
		summary: "Process multiple names",
		description: `
Process up to 100 Persian names in a single request for efficient bulk operations.

**Features:**
- Process up to 100 names per request
- Parallel processing with caching optimization
- Confidence scoring for each result
- Processing time metrics
- Error tracking and reporting
- Optional popularity scores

**Requirements:**
- API key required (Basic tier or higher)
- Names must be valid Persian text
- Maximum 100 names per request

**Performance:**
- Optimized with multi-layer caching
- Parallel database lookups
- Typical processing time: 50-200ms for 100 names
`,
		security: [{ ApiKeyAuth: [] }],
		requestBody: {
			required: true,
			content: {
				"application/json": {
					schema: resolver(batchRequestSchema),
					examples: {
						basic: {
							summary: "Basic batch request",
							description: "Simple batch request without popularity",
							value: {
								names: ["علی", "زهرا", "محمد", "فاطمه"],
								includePopularity: false,
							},
						},
						withPopularity: {
							summary: "With popularity scores",
							description: "Batch request including popularity data",
							value: {
								names: ["علی", "زهرا", "محمد", "فاطمه", "حسن", "مریم"],
								includePopularity: true,
							},
						},
						maxSize: {
							summary: "Maximum size request",
							description: "Batch request with 100 names (maximum allowed)",
							value: {
								names: Array.from({ length: 100 }, (_, i) => `نام${i + 1}`),
								includePopularity: true,
							},
						},
					},
				},
			},
		},
		responses: {
			200: {
				description: "Successful batch processing results",
				content: {
					"application/json": {
						schema: resolver(batchResponseSchema),
						examples: {
							success: {
								summary: "Successful batch response",
								description: "All names processed successfully",
								value: {
									results: [
										{
											name: "علی",
											gender: "male",
											enName: "Ali",
											popularity: 95,
											confidence: 1.0,
										},
										{
											name: "زهرا",
											gender: "female",
											enName: "Zahra",
											popularity: 87,
											confidence: 1.0,
										},
									],
									processedCount: 2,
									errorCount: 0,
									processingTime: 85,
								},
							},
							withErrors: {
								summary: "Batch response with some errors",
								description: "Some names could not be processed",
								value: {
									results: [
										{
											name: "علی",
											gender: "male",
											enName: "Ali",
											popularity: 95,
											confidence: 1.0,
										},
										{
											name: "نامناشناخته",
											gender: null,
											enName: null,
											popularity: 0,
											confidence: 0.0,
										},
									],
									processedCount: 2,
									errorCount: 1,
									processingTime: 120,
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
					"X-Processing-Time": {
						description: "Total processing time in milliseconds",
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
				description: "Bad request - Invalid input data",
				content: {
					"application/json": {
						schema: resolver(exceptionSchema),
						examples: {
							validation: {
								summary: "Validation error",
								value: {
									code: 40001,
									message: "Names array must contain between 1 and 100 valid Persian names",
								},
							},
							emptyArray: {
								summary: "Empty names array",
								value: {
									code: 40001,
									message: "Names array cannot be empty",
								},
							},
							tooManyNames: {
								summary: "Too many names",
								value: {
									code: 40001,
									message: "Maximum 100 names allowed per batch request",
								},
							},
						},
					},
				},
			},
			403: {
				description: "Forbidden - API key required for batch processing",
				content: {
					"application/json": {
						schema: resolver(exceptionSchema),
						examples: {
							noApiKey: {
								summary: "API key required",
								value: {
									code: 40303,
									message: "Batch processing requires a paid API key",
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
		},
	}),
	zValidator("json", batchRequestSchema, (result, ctx) => {
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
			const tier = c.get("rateLimitTier");
			const requestLogger = c.get("logger");

			if (tier === "FREE") {
				requestLogger.warn("Batch processing denied for free tier");
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
			const cache = c.get("cache");

			requestLogger.info("Batch processing started", {
				namesCount: names.length,
				includePopularity,
			});

			if (!names || names.length === 0) {
				return c.json(
					{
						code: 40001,
						message: "Names array cannot be empty",
					},
					400,
				);
			}

			if (names.length > 100) {
				return c.json(
					{
						code: 40001,
						message: "Maximum 100 names allowed per batch request",
					},
					400,
				);
			}

			const results = [];
			let errorCount = 0;

			// Process names in parallel for better performance
			const processName = async (name: string) => {
				try {
					// Check cache first
					const cached = await cache.get<any>(`name:${name}`);
					if (cached) {
						requestLogger.logCache("hit", `name:${name}`);
						return {
							name,
							gender: cached.gender,
							enName: cached.enName,
							popularity: includePopularity ? cached.popularity : undefined,
							confidence: 1.0,
						};
					}

					// Query database
					const data = await db.persianName.findFirst({
						where: { name: { equals: name } },
						select: {
							gender: true,
							enName: true,
							popularity: includePopularity,
						},
					});

					const result = {
						name,
						gender: data?.gender || null,
						enName: data?.enName || null,
						popularity: includePopularity ? data?.popularity || 0 : undefined,
						confidence: data ? 0.95 : 0.0,
					};

					// Cache the result if found
					if (data) {
						await cache.set(
							`name:${name}`,
							{
								gender: data.gender,
								enName: data.enName,
								popularity: data.popularity,
							},
							3600,
						);
						requestLogger.logCache("set", `name:${name}`);
					} else {
						requestLogger.logCache("miss", `name:${name}`);
					}

					return result;
				} catch (error) {
					requestLogger.error(`Error processing name ${name}`, error as Error);
					return {
						name,
						gender: null,
						enName: null,
						popularity: includePopularity ? 0 : undefined,
						confidence: 0.0,
					};
				}
			};

			// Process all names in parallel batches of 10 to avoid overwhelming the database
			const batchSize = 10;
			for (let i = 0; i < names.length; i += batchSize) {
				const batch = names.slice(i, i + batchSize);
				const batchResults = await Promise.all(batch.map(processName));

				// Count errors in this batch
				batchResults.forEach((result) => {
					if (result.confidence === 0.0) {
						errorCount++;
					}
				});

				results.push(...batchResults);
			}

			const processingTime = Date.now() - startTime;

			// Add performance headers
			c.header("X-Processing-Time", `${processingTime}ms`);
			c.header("X-Processed-Count", names.length.toString());
			c.header("X-Error-Count", errorCount.toString());

			requestLogger.logPerformance("batch_processing_time", processingTime, "ms", {
				processedCount: names.length,
				errorCount,
				successRate: ((names.length - errorCount) / names.length) * 100,
			});

			requestLogger.info("Batch processing completed", {
				processedCount: names.length,
				errorCount,
				processingTime,
			});

			return c.json({
				results,
				processedCount: names.length,
				errorCount,
				processingTime,
			});
		} catch (error) {
			const requestLogger = c.get("logger");
			const { names } = c.req.valid("json") || { names: [] };
			requestLogger.error("Batch processing failed", error as Error, { namesCount: names?.length });
			return c.json(
				{
					code: 50001,
					message: "Internal server error during batch processing",
				},
				500,
			);
		}
	},
);
