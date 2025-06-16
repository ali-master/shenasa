import type { PrismaClient } from "@prisma/client";
import { createUniqueId } from "./unique-id";
import { rateLimitTiers } from "./rate-limiter";

export class ApiKeyManager {
	constructor(private db: PrismaClient) {}

	async createApiKey(
		name: string,
		tier: "FREE" | "BASIC" | "PREMIUM" | "ENTERPRISE" = "FREE",
	): Promise<{
		id: string;
		key: string;
		name: string;
		tier: string;
		requestLimit: number;
	}> {
		const key = `sk_${createUniqueId()}`;
		const requestLimit = rateLimitTiers[tier].requests;

		const apiKey = await this.db.apiKey.create({
			data: {
				key,
				name,
				tier,
				requestLimit,
			},
		});

		return {
			id: apiKey.id,
			key: apiKey.key,
			name: apiKey.name,
			tier: apiKey.tier,
			requestLimit: apiKey.requestLimit,
		};
	}

	async validateApiKey(key: string): Promise<{
		isValid: boolean;
		apiKey?: {
			id: string;
			tier: string;
			requestLimit: number;
			requestCount: number;
			isActive: boolean;
		};
	}> {
		try {
			const apiKey = await this.db.apiKey.findUnique({
				where: { key },
			});

			if (!apiKey || !apiKey.isActive) {
				return { isValid: false };
			}

			// Check if the key is within rate limits (hourly)
			const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
			const recentRequests = await this.db.requestLog.count({
				where: {
					apiKey: key,
					createdAt: { gte: oneHourAgo },
				},
			});

			if (recentRequests >= apiKey.requestLimit) {
				return { isValid: false };
			}

			// Update last used timestamp
			await this.db.apiKey.update({
				where: { id: apiKey.id },
				data: { lastUsedAt: new Date() },
			});

			return {
				isValid: true,
				apiKey: {
					id: apiKey.id,
					tier: apiKey.tier,
					requestLimit: apiKey.requestLimit,
					requestCount: apiKey.requestCount,
					isActive: apiKey.isActive,
				},
			};
		} catch (error) {
			console.error("API key validation error:", error);
			return { isValid: false };
		}
	}

	async incrementUsage(key: string): Promise<void> {
		try {
			await this.db.apiKey.update({
				where: { key },
				data: {
					requestCount: { increment: 1 },
					lastUsedAt: new Date(),
				},
			});
		} catch (error) {
			console.error("Failed to increment API key usage:", error);
		}
	}

	async getApiKeyStats(key: string): Promise<{
		requestCount: number;
		requestLimit: number;
		remainingRequests: number;
		resetTime: Date;
	} | null> {
		try {
			const apiKey = await this.db.apiKey.findUnique({
				where: { key },
			});

			if (!apiKey) return null;

			const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
			const recentRequests = await this.db.requestLog.count({
				where: {
					apiKey: key,
					createdAt: { gte: oneHourAgo },
				},
			});

			const resetTime = new Date();
			resetTime.setHours(resetTime.getHours() + 1, 0, 0, 0);

			return {
				requestCount: recentRequests,
				requestLimit: apiKey.requestLimit,
				remainingRequests: Math.max(0, apiKey.requestLimit - recentRequests),
				resetTime,
			};
		} catch (error) {
			console.error("Failed to get API key stats:", error);
			return null;
		}
	}

	async listApiKeys(): Promise<
		Array<{
			id: string;
			name: string;
			tier: string;
			requestLimit: number;
			requestCount: number;
			isActive: boolean;
			createdAt: Date;
			lastUsedAt: Date | null;
		}>
	> {
		try {
			return await this.db.apiKey.findMany({
				select: {
					id: true,
					name: true,
					tier: true,
					requestLimit: true,
					requestCount: true,
					isActive: true,
					createdAt: true,
					lastUsedAt: true,
				},
				orderBy: { createdAt: "desc" },
			});
		} catch (error) {
			console.error("Failed to list API keys:", error);
			return [];
		}
	}

	async deactivateApiKey(key: string): Promise<boolean> {
		try {
			await this.db.apiKey.update({
				where: { key },
				data: { isActive: false },
			});
			return true;
		} catch (error) {
			console.error("Failed to deactivate API key:", error);
			return false;
		}
	}
}
