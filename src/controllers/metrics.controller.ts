import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { resolver } from "hono-openapi/zod";

import { metricsResponseSchema, exceptionSchema } from "../schema";
import { MetricsCollector, rateLimitTiers } from "../utils";

type Bindings = {
	DB: D1Database;
};

type Variables = {
	rateLimitTier: keyof typeof rateLimitTiers;
	metrics: MetricsCollector;
	logger: any;
};

export const metricsController = new Hono<{ Bindings: Bindings; Variables: Variables }>();

/**
 * GET /metrics - System metrics endpoint
 * Get system metrics and usage statistics
 */
metricsController.get(
	"/",
	describeRoute({
		tags: ["Metrics"],
		summary: "Get system metrics",
		description: `
Retrieve comprehensive system metrics and usage statistics for the last 7 days.

**Available metrics:**
- Total requests and processing volume
- Average response times and performance data
- Error rates and failure statistics
- Popular names and usage patterns
- Cache hit rates and efficiency metrics
- Geographic usage distribution

**Requirements:**
- API key required (Basic tier or higher)
- Metrics data is aggregated daily
- Historical data available for up to 30 days

**Use cases:**
- Performance monitoring and optimization
- Usage analytics and trend analysis
- Capacity planning and scaling decisions
- API health monitoring
`,
		security: [{ ApiKeyAuth: [] }],
		responses: {
			200: {
				description: "System metrics and usage statistics",
				content: {
					"application/json": {
						schema: resolver(metricsResponseSchema),
						examples: {
							basic: {
								summary: "Basic metrics response",
								description: "Standard metrics for the last 7 days",
								value: {
									period: {
										start: "2024-06-09T00:00:00Z",
										end: "2024-06-16T23:59:59Z",
										days: 7,
									},
									requests: {
										total: 15420,
										successful: 14876,
										failed: 544,
										errorRate: 3.5,
									},
									performance: {
										averageResponseTime: 87,
										p95ResponseTime: 156,
										p99ResponseTime: 234,
										cacheHitRate: 78.3,
									},
									usage: {
										uniqueNames: 8932,
										popularNames: [
											{ name: "علی", count: 1204 },
											{ name: "زهرا", count: 987 },
											{ name: "محمد", count: 834 },
										],
										genderDistribution: {
											male: 52.3,
											female: 47.7,
										},
									},
								},
							},
							detailed: {
								summary: "Detailed metrics with trends",
								description: "Comprehensive metrics including daily breakdowns",
								value: {
									period: {
										start: "2024-06-09T00:00:00Z",
										end: "2024-06-16T23:59:59Z",
										days: 7,
									},
									requests: {
										total: 15420,
										successful: 14876,
										failed: 544,
										errorRate: 3.5,
										dailyBreakdown: [
											{ date: "2024-06-09", requests: 2103, errors: 67 },
											{ date: "2024-06-10", requests: 2245, errors: 78 },
											{ date: "2024-06-11", requests: 2187, errors: 71 },
										],
									},
									performance: {
										averageResponseTime: 87,
										p95ResponseTime: 156,
										p99ResponseTime: 234,
										cacheHitRate: 78.3,
										trends: {
											responseTime: "improving",
											cacheEfficiency: "stable",
										},
									},
									usage: {
										uniqueNames: 8932,
										popularNames: [
											{ name: "علی", count: 1204, trend: "up" },
											{ name: "زهرا", count: 987, trend: "stable" },
											{ name: "محمد", count: 834, trend: "down" },
										],
										genderDistribution: {
											male: 52.3,
											female: 47.7,
										},
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
					"X-Metrics-Generated": {
						description: "Timestamp when metrics were generated",
						schema: { type: "string" },
					},
					"Cache-Control": {
						description: "Cache control for metrics data",
						schema: { type: "string", example: "public, max-age=300" },
					},
				},
			},
			403: {
				description: "Forbidden - Paid API key required",
				content: {
					"application/json": {
						schema: resolver(exceptionSchema),
						examples: {
							freeUser: {
								summary: "Free tier limitation",
								value: {
									code: 40301,
									message: "Metrics access requires a paid API key",
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
								summary: "Metrics generation failed",
								value: {
									code: 50001,
									message: "Failed to generate metrics data",
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
			const tier = c.get("rateLimitTier");
			const metrics = c.get("metrics");

			// Check if user has access to metrics
			if (tier === "FREE") {
				return c.json(
					{
						code: 40301,
						message: "Metrics access requires a paid API key",
					},
					403,
				);
			}

			// Get metrics for the last 7 days
			const metricsData = await metrics.getMetrics(7);

			// Add caching headers (cache for 5 minutes)
			c.header("Cache-Control", "public, max-age=300");
			c.header("X-Metrics-Generated", new Date().toISOString());

			return c.json(metricsData);
		} catch (error) {
			const requestLogger = c.get("logger");
			requestLogger.error("Metrics retrieval failed", error as Error);
			return c.json(
				{
					code: 50001,
					message: "Failed to generate metrics data",
				},
				500,
			);
		}
	},
);
