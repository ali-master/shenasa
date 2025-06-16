import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { resolver, validator as zValidator } from "hono-openapi/zod";

import { analyticsRequestSchema, analyticsResponseSchema, exceptionSchema } from "../schema";
import { MetricsCollector, rateLimitTiers } from "../utils";

type Bindings = {
	DB: D1Database;
};

type Variables = {
	rateLimitTier: keyof typeof rateLimitTiers;
	metrics: MetricsCollector;
	logger: any;
};

export const analyticsController = new Hono<{ Bindings: Bindings; Variables: Variables }>();

/**
 * GET /analytics - Advanced analytics endpoint
 * Get detailed analytics and insights
 */
analyticsController.get(
	"/",
	describeRoute({
		tags: ["Analytics"],
		summary: "Get advanced analytics",
		description: `
Retrieve detailed analytics and insights with advanced filtering and customization options.

**Advanced features:**
- Custom date range analysis
- Detailed usage patterns and trends
- Geographic distribution analytics
- Peak usage time analysis
- Name popularity trends over time
- API key usage breakdown
- Performance bottleneck identification

**Query parameters:**
- \`startDate\`: Start date for analysis (ISO 8601 format)
- \`endDate\`: End date for analysis (ISO 8601 format)
- \`limit\`: Maximum number of results for lists (1-1000)

**Requirements:**
- API key required (Premium tier or higher)
- Maximum date range: 90 days
- Data aggregated hourly for detailed analysis

**Use cases:**
- Business intelligence and reporting
- Usage pattern optimization
- Performance trend analysis
- Capacity planning and forecasting
`,
		security: [{ ApiKeyAuth: [] }],
		parameters: [
			{
				name: "startDate",
				in: "query",
				required: false,
				description: "Start date for analytics period (ISO 8601 format)",
				schema: {
					type: "string",
					format: "date-time",
					example: "2024-01-01T00:00:00Z",
				},
			},
			{
				name: "endDate",
				in: "query",
				required: false,
				description: "End date for analytics period (ISO 8601 format)",
				schema: {
					type: "string",
					format: "date-time",
					example: "2024-12-31T23:59:59Z",
				},
			},
			{
				name: "limit",
				in: "query",
				required: false,
				description: "Maximum number of results for lists",
				schema: {
					type: "integer",
					minimum: 1,
					maximum: 1000,
					default: 100,
					example: 50,
				},
			},
		],
		responses: {
			200: {
				description: "Advanced analytics data",
				content: {
					"application/json": {
						schema: resolver(analyticsResponseSchema),
						examples: {
							comprehensive: {
								summary: "Comprehensive analytics",
								description: "Full analytics report with all metrics",
								value: {
									period: {
										start: "2024-05-01T00:00:00Z",
										end: "2024-06-16T23:59:59Z",
										days: 46,
									},
									overview: {
										totalRequests: 45720,
										uniqueUsers: 1842,
										averageRequestsPerUser: 24.8,
										peakHour: "14:00",
										peakDay: "2024-06-15",
									},
									trends: {
										requestGrowth: 12.5,
										userGrowth: 8.3,
										popularityShifts: [
											{ name: "علی", changePercent: 5.2 },
											{ name: "زهرا", changePercent: -2.1 },
										],
									},
									geographic: {
										topCountries: [
											{ country: "Iran", requests: 28432, percentage: 62.2 },
											{ country: "Afghanistan", requests: 9144, percentage: 20.0 },
											{ country: "Tajikistan", requests: 4572, percentage: 10.0 },
										],
										distribution: "global",
									},
									performance: {
										averageResponseTime: 92,
										p95ResponseTime: 167,
										slowestEndpoints: [
											{ endpoint: "/batch", avgTime: 234 },
											{ endpoint: "/analytics", avgTime: 156 },
										],
										cacheEfficiency: 82.1,
									},
									usage: {
										mostPopularNames: [
											{ name: "علی", requests: 2847, rank: 1 },
											{ name: "زهرا", requests: 2134, rank: 2 },
											{ name: "محمد", requests: 1976, rank: 3 },
										],
										genderDistribution: {
											male: 53.7,
											female: 46.3,
										},
										batchUsage: {
											totalBatchRequests: 1247,
											averageNamesPerBatch: 23.4,
											largestBatch: 100,
										},
									},
								},
							},
							dateFiltered: {
								summary: "Date-filtered analytics",
								description: "Analytics for a specific date range",
								value: {
									period: {
										start: "2024-06-01T00:00:00Z",
										end: "2024-06-07T23:59:59Z",
										days: 7,
									},
									overview: {
										totalRequests: 12340,
										uniqueUsers: 456,
										averageRequestsPerUser: 27.1,
										peakHour: "15:00",
										peakDay: "2024-06-05",
									},
									trends: {
										requestGrowth: 15.2,
										userGrowth: 11.8,
										popularityShifts: [],
									},
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
					"X-Analytics-Generated": {
						description: "Timestamp when analytics were generated",
						schema: { type: "string" },
					},
					"X-Data-Points": {
						description: "Number of data points analyzed",
						schema: { type: "string" },
					},
					"Cache-Control": {
						description: "Cache control for analytics data",
						schema: { type: "string", example: "public, max-age=600" },
					},
				},
			},
			400: {
				description: "Bad request - Invalid query parameters",
				content: {
					"application/json": {
						schema: resolver(exceptionSchema),
						examples: {
							invalidDate: {
								summary: "Invalid date format",
								value: {
									code: 40001,
									message: "Invalid date format. Use ISO 8601 format (YYYY-MM-DDTHH:mm:ssZ)",
								},
							},
							dateRange: {
								summary: "Invalid date range",
								value: {
									code: 40001,
									message: "Date range cannot exceed 90 days",
								},
							},
							futureDate: {
								summary: "Future date provided",
								value: {
									code: 40001,
									message: "End date cannot be in the future",
								},
							},
						},
					},
				},
			},
			403: {
				description: "Forbidden - Premium API key required",
				content: {
					"application/json": {
						schema: resolver(exceptionSchema),
						examples: {
							insufficientTier: {
								summary: "Insufficient API tier",
								value: {
									code: 40302,
									message: "Analytics access requires Premium or Enterprise API key",
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
	zValidator("query", analyticsRequestSchema, (result, ctx) => {
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
			const metrics = c.get("metrics");

			// Check if user has access to analytics
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

			// Validate date range
			if (startDate && endDate) {
				const start = new Date(startDate);
				const end = new Date(endDate);
				const diffDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));

				if (diffDays > 90) {
					return c.json(
						{
							code: 40001,
							message: "Date range cannot exceed 90 days",
						},
						400,
					);
				}

				if (end > new Date()) {
					return c.json(
						{
							code: 40001,
							message: "End date cannot be in the future",
						},
						400,
					);
				}
			}

			// Get analytics data
			const analyticsData = await metrics.getAnalytics(
				startDate ? new Date(startDate) : undefined,
				endDate ? new Date(endDate) : undefined,
				limit,
			);

			// Add caching headers (cache for 10 minutes)
			c.header("Cache-Control", "public, max-age=600");
			c.header("X-Analytics-Generated", new Date().toISOString());
			c.header("X-Data-Points", "unknown");

			return c.json(analyticsData);
		} catch (error) {
			const requestLogger = c.get("logger");
			requestLogger.error("Analytics retrieval failed", error as Error);
			return c.json(
				{
					code: 50001,
					message: "Failed to generate analytics data",
				},
				500,
			);
		}
	},
);
