import { z } from "zod";

// Webhook schemas
export const webhookCreateSchema = z.object({
	url: z.string().url(),
	events: z.array(z.string()).min(1),
	secret: z.string().optional(),
	retryCount: z.number().min(1).max(10).default(3),
});

export const webhookResponseSchema = z.object({
	id: z.string(),
	url: z.string(),
	events: z.array(z.string()),
	secret: z.string(),
	isActive: z.boolean(),
	createdAt: z.string().datetime(),
});

export const webhookListResponseSchema = z.object({
	webhooks: z.array(webhookResponseSchema.omit({ secret: true })),
	total: z.number(),
});

// Similarity schemas
export const similarityRequestSchema = z.object({
	name: z.string().min(1).max(50),
	limit: z.number().min(1).max(20).default(10),
	minSimilarity: z.number().min(0).max(1).default(0.6),
});

export const similarityResponseSchema = z.object({
	suggestions: z.array(
		z.object({
			name: z.string(),
			similarity: z.number(),
			algorithm: z.string(),
			gender: z.enum(["MALE", "FEMALE", "UNKNOWN"]).optional(),
			enName: z.string().optional(),
		}),
	),
	confidence: z.number().min(0).max(1),
	reasoning: z.string(),
});

// Geographic analytics schemas
export const geoAnalyticsResponseSchema = z.object({
	totalCountries: z.number(),
	totalRequests: z.number(),
	topCountries: z.array(
		z.object({
			country: z.string(),
			requestCount: z.number(),
			percentage: z.number(),
		}),
	),
	topRegions: z.array(
		z.object({
			country: z.string(),
			region: z.string(),
			requestCount: z.number(),
		}),
	),
	topCities: z.array(
		z.object({
			country: z.string(),
			city: z.string(),
			requestCount: z.number(),
		}),
	),
	popularNamesByCountry: z.array(
		z.object({
			country: z.string(),
			popularNames: z.array(
				z.object({
					name: z.string(),
					count: z.number(),
				}),
			),
		}),
	),
	dailyGeoTrends: z.array(
		z.object({
			date: z.string(),
			countries: z.number(),
			requests: z.number(),
		}),
	),
});

// Audit log schemas
export const auditLogRequestSchema = z.object({
	action: z.string().optional(),
	resource: z.string().optional(),
	userId: z.string().optional(),
	startDate: z.string().datetime().optional(),
	endDate: z.string().datetime().optional(),
	limit: z.number().min(1).max(1000).default(100),
});

export const auditLogResponseSchema = z.object({
	logs: z.array(
		z.object({
			id: z.string(),
			action: z.string(),
			resource: z.string(),
			resourceId: z.string().nullable(),
			userId: z.string().nullable(),
			apiKeyId: z.string().nullable(),
			ipAddress: z.string().nullable(),
			userAgent: z.string().nullable(),
			details: z.any(),
			createdAt: z.string().datetime(),
		}),
	),
	total: z.number(),
	summary: z.object({
		totalActions: z.number(),
		actionsByType: z.array(
			z.object({
				action: z.string(),
				count: z.number(),
			}),
		),
		resourcesByType: z.array(
			z.object({
				resource: z.string(),
				count: z.number(),
			}),
		),
	}),
});

// Data export schemas
export const dataExportRequestSchema = z.object({
	type: z.enum(["names", "metrics", "logs", "full", "custom"]),
	format: z.enum(["json", "csv", "sql"]),
	filters: z
		.object({
			startDate: z.string().datetime().optional(),
			endDate: z.string().datetime().optional(),
			gender: z.enum(["MALE", "FEMALE", "UNKNOWN"]).optional(),
			origin: z.string().optional(),
			minPopularity: z.number().min(0).optional(),
		})
		.optional(),
	customQuery: z.string().optional(),
});

export const dataExportResponseSchema = z.object({
	id: z.string(),
	downloadUrl: z.string(),
	estimatedSize: z.number(),
	status: z.enum(["pending", "processing", "completed", "failed"]),
});

export const dataExportStatusSchema = z.object({
	id: z.string(),
	type: z.string(),
	format: z.string(),
	status: z.string(),
	fileName: z.string().optional(),
	fileSize: z.number().optional(),
	downloadUrl: z.string().optional(),
	expiresAt: z.string().datetime().optional(),
	createdAt: z.string().datetime(),
	completedAt: z.string().datetime().optional(),
});

// Custom fields schemas
export const customFieldCreateSchema = z.object({
	name: z.string().min(1).max(50),
	type: z.enum(["string", "number", "boolean", "json"]),
	description: z.string().optional(),
	isRequired: z.boolean().default(false),
	defaultValue: z.string().optional(),
	validation: z.string().optional(), // JSON schema
});

export const customFieldResponseSchema = z.object({
	id: z.string(),
	name: z.string(),
	type: z.string(),
	description: z.string().nullable(),
	isRequired: z.boolean(),
	defaultValue: z.string().nullable(),
	validation: z.string().nullable(),
	createdAt: z.string().datetime(),
	updatedAt: z.string().datetime(),
});

// Alert rule schemas
export const alertRuleCreateSchema = z.object({
	name: z.string().min(1).max(100),
	description: z.string().optional(),
	metric: z.enum(["error_rate", "response_time", "request_count", "cache_hit_rate"]),
	operator: z.enum(["gt", "lt", "eq", "gte", "lte"]),
	threshold: z.number(),
	window: z.number().min(1).max(1440), // 1 minute to 24 hours
	webhookUrl: z.string().url().optional(),
	emailTo: z.string().email().optional(),
});

export const alertRuleResponseSchema = z.object({
	id: z.string(),
	name: z.string(),
	description: z.string().nullable(),
	metric: z.string(),
	operator: z.string(),
	threshold: z.number(),
	window: z.number(),
	isActive: z.boolean(),
	webhookUrl: z.string().nullable(),
	emailTo: z.string().nullable(),
	createdAt: z.string().datetime(),
	updatedAt: z.string().datetime(),
});

// Enhanced name lookup schemas
export const enhancedNameLookupResponseSchema = z.object({
	gender: z.enum(["MALE", "FEMALE", "UNKNOWN"]).nullable(),
	enName: z.string().nullable(),
	origin: z.string().nullable(),
	abjadValue: z.number().nullable(),
	popularity: z.number().nullable(),
	isApproved: z.boolean().nullable(),
	similarNames: z
		.array(
			z.object({
				name: z.string(),
				similarity: z.number(),
				gender: z.enum(["MALE", "FEMALE", "UNKNOWN"]).optional(),
			}),
		)
		.optional(),
	customData: z.record(z.any()).optional(),
	confidence: z.number().min(0).max(1),
	cached: z.boolean(),
});

// Bulk operations schemas
export const bulkNameCreateSchema = z.object({
	names: z
		.array(
			z.object({
				name: z.string().min(1).max(50),
				gender: z.enum(["MALE", "FEMALE", "UNKNOWN"]),
				enName: z.string().optional(),
				origin: z.string().optional(),
				abjadValue: z.number().optional(),
				popularity: z.number().default(0),
			}),
		)
		.min(1)
		.max(1000),
	overwriteExisting: z.boolean().default(false),
});

export const bulkNameResponseSchema = z.object({
	created: z.number(),
	updated: z.number(),
	skipped: z.number(),
	errors: z.array(
		z.object({
			name: z.string(),
			error: z.string(),
		}),
	),
	processingTime: z.number(),
});

// Advanced search schemas
export const advancedSearchSchema = z.object({
	query: z.string().optional(),
	gender: z.enum(["MALE", "FEMALE", "UNKNOWN"]).optional(),
	origin: z.string().optional(),
	minPopularity: z.number().min(0).optional(),
	maxPopularity: z.number().min(0).optional(),
	hasEnglishName: z.boolean().optional(),
	isApproved: z.boolean().optional(),
	sortBy: z.enum(["name", "popularity", "createdAt"]).default("popularity"),
	sortOrder: z.enum(["asc", "desc"]).default("desc"),
	page: z.number().min(1).default(1),
	limit: z.number().min(1).max(100).default(20),
});

export const advancedSearchResponseSchema = z.object({
	results: z.array(
		z.object({
			name: z.string(),
			gender: z.enum(["MALE", "FEMALE", "UNKNOWN"]),
			enName: z.string().nullable(),
			origin: z.string().nullable(),
			popularity: z.number(),
			isApproved: z.boolean(),
		}),
	),
	pagination: z.object({
		page: z.number(),
		limit: z.number(),
		total: z.number(),
		totalPages: z.number(),
		hasNext: z.boolean(),
		hasPrev: z.boolean(),
	}),
	facets: z.object({
		genderDistribution: z.object({
			male: z.number(),
			female: z.number(),
			unknown: z.number(),
		}),
		originDistribution: z.array(
			z.object({
				origin: z.string().nullable(),
				count: z.number(),
			}),
		),
	}),
});

// Monitoring schemas
export const systemStatusResponseSchema = z.object({
	status: z.enum(["healthy", "degraded", "unhealthy"]),
	timestamp: z.string().datetime(),
	version: z.string(),
	uptime: z.number(),
	services: z.object({
		database: z.object({
			status: z.enum(["pass", "fail"]),
			responseTime: z.number(),
			connectionCount: z.number().optional(),
		}),
		cache: z.object({
			status: z.enum(["pass", "fail"]),
			responseTime: z.number(),
			hitRate: z.number().optional(),
		}),
		memory: z.object({
			status: z.enum(["pass", "fail"]),
			usage: z.number(),
			limit: z.number().optional(),
		}),
		webhooks: z.object({
			status: z.enum(["pass", "fail"]),
			activeCount: z.number(),
			failureRate: z.number(),
		}),
	}),
	alerts: z.array(
		z.object({
			id: z.string(),
			message: z.string(),
			severity: z.enum(["low", "medium", "high", "critical"]),
			createdAt: z.string().datetime(),
		}),
	),
});
