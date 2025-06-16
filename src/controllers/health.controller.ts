import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { resolver } from "hono-openapi/zod";

import { healthCheckResponseSchema } from "../schema";
import { prismaClient, CacheManager } from "../utils";

type Bindings = {
	DB: D1Database;
};

type Variables = {
	cache: CacheManager;
	logger: any;
};

export const healthController = new Hono<{ Bindings: Bindings; Variables: Variables }>();

/**
 * GET /health - Health check endpoint
 * Returns comprehensive system health status
 */
healthController.get(
	"/",
	describeRoute({
		tags: ["System"],
		summary: "System health check",
		description: `
Health check endpoint that verifies the status of all system components.

**Checks performed:**
- Database connectivity and response time
- Cache system availability and performance
- Memory usage simulation
- Overall system status assessment

**Status levels:**
- \`healthy\`: All systems operational
- \`degraded\`: Some non-critical issues detected
- \`unhealthy\`: Critical system failures

**Usage:**
This endpoint is perfect for monitoring, load balancer health checks, and uptime monitoring.
`,
		responses: {
			200: {
				description: "System health status",
				content: {
					"application/json": {
						schema: resolver(healthCheckResponseSchema),
						examples: {
							healthy: {
								summary: "Healthy system",
								description: "All systems are operational",
								value: {
									status: "healthy",
									timestamp: "2024-06-16T12:00:00Z",
									version: "2.0.0",
									uptime: 1500,
									checks: {
										database: { status: "pass", responseTime: 25 },
										cache: { status: "pass", responseTime: 5 },
										memory: { status: "pass", usage: 45.2 },
									},
								},
							},
							degraded: {
								summary: "Degraded system",
								description: "System operational but with issues",
								value: {
									status: "degraded",
									timestamp: "2024-06-16T12:00:00Z",
									version: "2.0.0",
									uptime: 1500,
									checks: {
										database: { status: "pass", responseTime: 150 },
										cache: { status: "fail", responseTime: 0 },
										memory: { status: "pass", usage: 75.8 },
									},
								},
							},
							unhealthy: {
								summary: "Unhealthy system",
								description: "Critical system failures detected",
								value: {
									status: "unhealthy",
									timestamp: "2024-06-16T12:00:00Z",
									version: "2.0.0",
									uptime: 1500,
									checks: {
										database: { status: "fail", responseTime: 0 },
										cache: { status: "fail", responseTime: 0 },
										memory: { status: "fail", usage: 95.5 },
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
					"Cache-Control": {
						description: "Cache control for health check",
						schema: { type: "string", example: "no-cache, no-store, must-revalidate" },
					},
				},
			},
		},
	}),
	async (c) => {
		const startTime = Date.now();
		const cache = c.get("cache");

		try {
			const db = await prismaClient.fetch(c.env.DB);

			// Database health check
			let dbStatus: "pass" | "fail" = "pass";
			let dbResponseTime = 0;
			try {
				const dbStart = Date.now();
				await db.persianName.findFirst();
				dbResponseTime = Date.now() - dbStart;
			} catch (error) {
				const requestLogger = c.get("logger");
				requestLogger.warn("Database health check failed", error as Error);
				dbStatus = "fail";
			}

			// Cache health check
			let cacheStatus: "pass" | "fail" = "pass";
			let cacheResponseTime = 0;
			try {
				const cacheStart = Date.now();
				await cache.get("health-check");
				cacheResponseTime = Date.now() - cacheStart;
			} catch (error) {
				const requestLogger = c.get("logger");
				requestLogger.warn("Cache health check failed", error as Error);
				cacheStatus = "fail";
			}

			// Memory usage (simulated for edge environment)
			const memoryUsage = Math.random() * 100;
			const memoryStatus: "pass" | "fail" = memoryUsage < 90 ? "pass" : "fail";

			// Determine overall status
			const overallStatus =
				dbStatus === "pass" && cacheStatus === "pass" && memoryStatus === "pass"
					? "healthy"
					: dbStatus === "fail"
						? "unhealthy"
						: "degraded";

			const uptime = Date.now() - startTime;

			// Prevent caching of health check responses
			c.header("Cache-Control", "no-cache, no-store, must-revalidate");
			c.header("Pragma", "no-cache");
			c.header("Expires", "0");

			return c.json({
				status: overallStatus,
				timestamp: new Date().toISOString(),
				version: "2.0.0",
				uptime,
				checks: {
					database: { status: dbStatus, responseTime: dbResponseTime },
					cache: { status: cacheStatus, responseTime: cacheResponseTime },
					memory: { status: memoryStatus, usage: memoryUsage },
				},
			});
		} catch (error) {
			const requestLogger = c.get("logger");
			requestLogger.error("Health check system failure", error as Error);

			// Return unhealthy status if health check itself fails
			return c.json(
				{
					status: "unhealthy",
					timestamp: new Date().toISOString(),
					version: "2.0.0",
					uptime: Date.now() - startTime,
					checks: {
						database: { status: "fail", responseTime: 0 },
						cache: { status: "fail", responseTime: 0 },
						memory: { status: "fail", usage: 0 },
					},
					error: "Health check system failure",
				},
				503,
			);
		}
	},
);
