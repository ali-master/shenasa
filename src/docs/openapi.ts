import type { OpenApiSpecsOptions } from "hono-openapi";

export const openAPIConfig: OpenApiSpecsOptions = {
	documentation: {
		// openapi: "3.0.0",
		info: {
			title: "Shenasa API",
			version: "2.0.0",
			description: `
# Shenasa (شناسا) - Persian Name Gender Detection API

An advanced, enterprise-grade API for determining the gender of Persian names. Built on Cloudflare Workers with comprehensive features including analytics, caching, rate limiting, and batch processing.

## Features

- 🔍 **Accurate Gender Detection**: High-precision Persian name gender identification
- 📊 **Advanced Analytics**: Detailed usage metrics and insights
- ⚡ **Multi-layer Caching**: Memory + KV + Database caching for optimal performance
- 🛡️ **Rate Limiting**: Tier-based rate limiting with generous quotas
- 📦 **Batch Processing**: Process up to 100 names in a single request
- 🌍 **Global Edge Network**: Deployed on Cloudflare's edge network for low latency
- 🔐 **Secure API Keys**: CUID2-based secure API key generation
- 📈 **Real-time Metrics**: Track usage patterns and performance metrics

## API Tiers

| Tier | Rate Limit | Batch Processing | Analytics | Metrics |
|------|------------|------------------|-----------|---------|
| FREE | 100/hour | ❌ | ❌ | ❌ |
| BASIC | 1K/hour | ✅ | ❌ | ✅ |
| PREMIUM | 10K/hour | ✅ | ✅ | ✅ |
| ENTERPRISE | 100K/hour | ✅ | ✅ | ✅ |

## Authentication

Most endpoints require an API key. Include it in the \`x-api-key\` header:

\`\`\`
x-api-key: your-api-key-here
\`\`\`

## Rate Limiting

All requests are subject to rate limiting based on your API tier. Rate limit information is included in response headers:

- \`X-RateLimit-Limit\`: Maximum requests allowed
- \`X-RateLimit-Remaining\`: Remaining requests in current window
- \`X-RateLimit-Reset\`: Timestamp when the rate limit resets

## Error Handling

The API uses structured error responses with specific error codes:

\`\`\`json
{
  "code": 40001,
  "message": "Validation error: Name is required"
}
\`\`\`

Common error codes:
- \`40001\`: Validation error
- \`40101\`: Invalid or expired API key
- \`40301\`: Feature requires paid API key
- \`42901\`: Rate limit exceeded
- \`50001\`: Internal server error
			`,
			contact: {
				name: "Ali Torki",
				email: "ali_4286@live.com",
				url: "https://github.com/ali-master",
			},
			license: {
				name: "MIT",
				url: "https://opensource.org/licenses/MIT",
			},
		},
		servers: [
			{
				url: "/",
				description: "Current Server",
			},
			{
				url: "https://shenasa.usestrict.dev/api/v1",
				description: "Production Server",
			},
			{
				url: "http://localhost:8787/api/v1",
				description: "Local Development Server",
			},
		],
		tags: [
			{
				name: "Name Lookup",
				description: "Persian name gender detection endpoints",
			},
			{
				name: "Batch Processing",
				description: "Bulk name processing operations",
			},
			{
				name: "Analytics",
				description: "Usage analytics and insights",
			},
			{
				name: "Metrics",
				description: "System metrics and performance data",
			},
			{
				name: "Admin",
				description: "Administrative operations",
			},
			{
				name: "System",
				description: "System health and status endpoints",
			},
		],
		components: {
			securitySchemes: {
				ApiKeyAuth: {
					type: "apiKey",
					in: "header",
					name: "x-api-key",
					description: "API key for authentication. Required for most endpoints.",
				},
				AdminAuth: {
					type: "apiKey",
					in: "header",
					name: "x-admin-key",
					description: "Admin authentication key for administrative operations.",
				},
			},
			parameters: {
				NameParam: {
					name: "name",
					in: "path",
					required: true,
					description: "Persian name to analyze",
					schema: {
						type: "string",
						minLength: 1,
						maxLength: 50,
						pattern: "^[\\u0600-\\u06FF\\s]+$",
						example: "علی",
					},
				},
				StartDateParam: {
					name: "startDate",
					in: "query",
					required: false,
					description: "Start date for analytics (ISO 8601 format)",
					schema: {
						type: "string",
						format: "date-time",
						example: "2024-01-01T00:00:00Z",
					},
				},
				EndDateParam: {
					name: "endDate",
					in: "query",
					required: false,
					description: "End date for analytics (ISO 8601 format)",
					schema: {
						type: "string",
						format: "date-time",
						example: "2024-12-31T23:59:59Z",
					},
				},
				LimitParam: {
					name: "limit",
					in: "query",
					required: false,
					description: "Maximum number of results to return",
					schema: {
						type: "integer",
						minimum: 1,
						maximum: 1000,
						default: 100,
						example: 50,
					},
				},
			},
			headers: {
				RateLimitHeaders: {
					"X-RateLimit-Limit": {
						description: "Maximum number of requests allowed in the time window",
						schema: {
							type: "integer",
							example: 1000,
						},
					},
					"X-RateLimit-Remaining": {
						description: "Number of requests remaining in the current time window",
						schema: {
							type: "integer",
							example: 999,
						},
					},
					"X-RateLimit-Reset": {
						description: "Timestamp when the rate limit window resets",
						schema: {
							type: "integer",
							example: 1704067200,
						},
					},
				},
				CacheHeaders: {
					ETag: {
						description: "Entity tag for cache validation",
						schema: {
							type: "string",
							example: '"33a64df551425fcc55e4d42a148795d9f25f89d4"',
						},
					},
					"Cache-Control": {
						description: "Cache control directives",
						schema: {
							type: "string",
							example: "public, max-age=3600",
						},
					},
				},
				RequestHeaders: {
					"X-Request-Id": {
						description: "Unique request identifier for tracking",
						schema: {
							type: "string",
							example: "req_2Z4LxDGpJf1r2X8YqN3KmH5vT6",
						},
					},
				},
			},
			examples: {
				MaleNameExample: {
					summary: "Male name example",
					description: "Example response for a male Persian name",
					value: {
						gender: "male",
						enName: "Ali",
					},
				},
				FemaleNameExample: {
					summary: "Female name example",
					description: "Example response for a female Persian name",
					value: {
						gender: "female",
						enName: "Zahra",
					},
				},
				UnknownNameExample: {
					summary: "Unknown name example",
					description: "Example response for an unknown name",
					value: {
						gender: null,
						enName: null,
					},
				},
				BatchRequestExample: {
					summary: "Batch processing request",
					description: "Example batch request with multiple names",
					value: {
						names: ["علی", "زهرا", "محمد", "فاطمه"],
						includePopularity: true,
					},
				},
				BatchResponseExample: {
					summary: "Batch processing response",
					description: "Example batch response with results",
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
						processedCount: 4,
						errorCount: 0,
						processingTime: 156,
					},
				},
				ValidationErrorExample: {
					summary: "Validation error",
					description: "Example validation error response",
					value: {
						code: 40001,
						message: "Name must be between 1 and 50 characters",
					},
				},
				RateLimitErrorExample: {
					summary: "Rate limit exceeded",
					description: "Example rate limit error response",
					value: {
						code: 42901,
						message: "Rate limit exceeded. Please try again later.",
					},
				},
			},
		},
		externalDocs: {
			description: "Find more information about the Shenasa API",
			url: "https://github.com/ali-master/shenasa",
		},
	},
};
