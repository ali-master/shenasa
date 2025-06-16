import { z } from "zod";

export const metricsResponseSchema = z.object({
	totalRequests: z.number(),
	successfulRequests: z.number(),
	failedRequests: z.number(),
	averageResponseTime: z.number(),
	uniqueNamesCount: z.number(),
	topRequestedNames: z.array(
		z.object({
			name: z.string(),
			count: z.number(),
		}),
	),
	requestsByHour: z.array(
		z.object({
			hour: z.string(),
			count: z.number(),
		}),
	),
	errorRate: z.number(),
	uptime: z.string(),
});

export const analyticsRequestSchema = z.object({
	startDate: z.string().datetime().optional(),
	endDate: z.string().datetime().optional(),
	limit: z.coerce.number().min(1).max(100).default(50),
});

export const analyticsResponseSchema = z.object({
	genderDistribution: z.object({
		male: z.number(),
		female: z.number(),
		unknown: z.number(),
	}),
	popularNames: z.array(
		z.object({
			name: z.string(),
			gender: z.enum(["MALE", "FEMALE", "UNKNOWN"]),
			count: z.number(),
			popularity: z.number(),
		}),
	),
	originDistribution: z.array(
		z.object({
			origin: z.string().nullable(),
			count: z.number(),
			percentage: z.number(),
		}),
	),
	dailyTrends: z.array(
		z.object({
			date: z.string(),
			requests: z.number(),
			uniqueNames: z.number(),
		}),
	),
});

export const healthCheckResponseSchema = z.object({
	status: z.enum(["healthy", "unhealthy", "degraded"]),
	timestamp: z.string().datetime(),
	version: z.string(),
	uptime: z.number(),
	checks: z.object({
		database: z.object({
			status: z.enum(["pass", "fail"]),
			responseTime: z.number(),
		}),
		cache: z.object({
			status: z.enum(["pass", "fail"]),
			responseTime: z.number(),
		}),
		memory: z.object({
			status: z.enum(["pass", "fail"]),
			usage: z.number(),
		}),
	}),
});

export const batchRequestSchema = z.object({
	names: z.array(z.string().min(1).max(50)).min(1).max(100),
	includePopularity: z.boolean().optional().default(false),
});

export const batchResponseSchema = z.object({
	results: z.array(
		z.object({
			name: z.string(),
			gender: z.enum(["MALE", "FEMALE", "UNKNOWN"]).nullable(),
			enName: z.string().nullable(),
			popularity: z.number().optional(),
			confidence: z.number(),
		}),
	),
	processedCount: z.number(),
	errorCount: z.number(),
	processingTime: z.number(),
});

export const apiKeyCreateSchema = z.object({
	name: z.string().min(1).max(100),
	tier: z.enum(["FREE", "BASIC", "PREMIUM", "ENTERPRISE"]).default("FREE"),
});

export const apiKeyResponseSchema = z.object({
	id: z.string(),
	key: z.string(),
	name: z.string(),
	tier: z.enum(["FREE", "BASIC", "PREMIUM", "ENTERPRISE"]),
	requestLimit: z.number(),
	requestCount: z.number(),
	isActive: z.boolean(),
	createdAt: z.string().datetime(),
	lastUsedAt: z.string().datetime().nullable(),
});
