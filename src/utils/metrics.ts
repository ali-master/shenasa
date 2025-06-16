import type { PrismaClient } from "@prisma/client";

export class MetricsCollector {
	constructor(private db: PrismaClient) {}

	async logRequest(data: {
		persianNameId?: string;
		requestedName: string;
		ipAddress?: string;
		userAgent?: string;
		responseTime: number;
		statusCode: number;
		apiKey?: string;
	}): Promise<void> {
		try {
			await this.db.requestLog.create({
				data,
			});
		} catch (error) {
			console.error("Failed to log request:", error);
		}
	}

	async getMetrics(days = 7): Promise<{
		totalRequests: number;
		successfulRequests: number;
		failedRequests: number;
		averageResponseTime: number;
		uniqueNamesCount: number;
		topRequestedNames: Array<{ name: string; count: number }>;
		requestsByHour: Array<{ hour: string; count: number }>;
		errorRate: number;
		uptime: string;
	}> {
		const startDate = new Date();
		startDate.setDate(startDate.getDate() - days);

		const [
			totalRequests,
			successfulRequests,
			failedRequests,
			avgResponseTime,
			uniqueNames,
			topNames,
			hourlyRequests,
		] = await Promise.all([
			this.db.requestLog.count({
				where: { createdAt: { gte: startDate } },
			}),
			this.db.requestLog.count({
				where: {
					createdAt: { gte: startDate },
					statusCode: { gte: 200, lt: 300 },
				},
			}),
			this.db.requestLog.count({
				where: {
					createdAt: { gte: startDate },
					statusCode: { gte: 400 },
				},
			}),
			this.db.requestLog.aggregate({
				where: { createdAt: { gte: startDate } },
				_avg: { responseTime: true },
			}),
			this.db.requestLog.groupBy({
				by: ["requestedName"],
				where: { createdAt: { gte: startDate } },
				_count: { requestedName: true },
			}),
			this.db.requestLog.groupBy({
				by: ["requestedName"],
				where: { createdAt: { gte: startDate } },
				_count: { requestedName: true },
				orderBy: { _count: { requestedName: "desc" } },
				take: 10,
			}),
			this.db.$queryRaw<Array<{ hour: string; count: bigint }>>`
				SELECT 
					strftime('%Y-%m-%d %H:00:00', createdAt) as hour,
					COUNT(*) as count
				FROM RequestLog 
				WHERE createdAt >= ${startDate.toISOString()}
				GROUP BY strftime('%Y-%m-%d %H:00:00', createdAt)
				ORDER BY hour
			`,
		]);

		const errorRate = totalRequests > 0 ? (failedRequests / totalRequests) * 100 : 0;
		const uptimeMs = Date.now() - startDate.getTime();
		const uptime = this.formatUptime(uptimeMs);

		return {
			totalRequests,
			successfulRequests,
			failedRequests,
			averageResponseTime: avgResponseTime._avg.responseTime || 0,
			uniqueNamesCount: uniqueNames.length,
			topRequestedNames: topNames.map((item) => ({
				name: item.requestedName,
				count: item._count.requestedName,
			})),
			requestsByHour: hourlyRequests.map((item) => ({
				hour: item.hour,
				count: Number(item.count),
			})),
			errorRate,
			uptime,
		};
	}

	async getAnalytics(
		startDate?: Date,
		endDate?: Date,
		limit = 50,
	): Promise<{
		genderDistribution: { male: number; female: number; unknown: number };
		popularNames: Array<{
			name: string;
			gender: "MALE" | "FEMALE" | "UNKNOWN";
			count: number;
			popularity: number;
		}>;
		originDistribution: Array<{
			origin: string | null;
			count: number;
			percentage: number;
		}>;
		dailyTrends: Array<{
			date: string;
			requests: number;
			uniqueNames: number;
		}>;
	}> {
		const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
		const end = endDate || new Date();

		const [genderStats, popularNames, originStats, dailyStats] = await Promise.all([
			this.db.persianName.groupBy({
				by: ["gender"],
				_count: { gender: true },
			}),
			this.db.persianName.findMany({
				orderBy: { popularity: "desc" },
				take: limit,
				select: {
					name: true,
					gender: true,
					popularity: true,
					_count: { select: { requestLogs: true } },
				},
			}),
			this.db.persianName.groupBy({
				by: ["origin"],
				_count: { origin: true },
				orderBy: { _count: { origin: "desc" } },
			}),
			this.db.$queryRaw<Array<{ date: string; requests: bigint; uniqueNames: bigint }>>`
				SELECT 
					DATE(createdAt) as date,
					COUNT(*) as requests,
					COUNT(DISTINCT requestedName) as uniqueNames
				FROM RequestLog 
				WHERE createdAt >= ${start.toISOString()} AND createdAt <= ${end.toISOString()}
				GROUP BY DATE(createdAt)
				ORDER BY date
			`,
		]);

		const totalOrigins = originStats.reduce((sum, item) => sum + item._count.origin, 0);

		return {
			genderDistribution: {
				male: genderStats.find((g) => g.gender === "MALE")?._count.gender || 0,
				female: genderStats.find((g) => g.gender === "FEMALE")?._count.gender || 0,
				unknown: genderStats.find((g) => g.gender === "UNKNOWN")?._count.gender || 0,
			},
			popularNames: popularNames.map((name) => ({
				name: name.name,
				gender: name.gender,
				count: name._count.requestLogs,
				popularity: name.popularity,
			})),
			originDistribution: originStats.map((item) => ({
				origin: item.origin,
				count: item._count.origin,
				percentage: (item._count.origin / totalOrigins) * 100,
			})),
			dailyTrends: dailyStats.map((item) => ({
				date: item.date,
				requests: Number(item.requests),
				uniqueNames: Number(item.uniqueNames),
			})),
		};
	}

	async updateDailyMetrics(): Promise<void> {
		const today = new Date();
		today.setHours(0, 0, 0, 0);

		const tomorrow = new Date(today);
		tomorrow.setDate(tomorrow.getDate() + 1);

		const metrics = await this.getMetrics(1);

		try {
			await this.db.systemMetrics.upsert({
				where: { date: today },
				update: {
					totalRequests: metrics.totalRequests,
					successfulRequests: metrics.successfulRequests,
					failedRequests: metrics.failedRequests,
					averageResponseTime: metrics.averageResponseTime,
					uniqueNamesCount: metrics.uniqueNamesCount,
				},
				create: {
					date: today,
					totalRequests: metrics.totalRequests,
					successfulRequests: metrics.successfulRequests,
					failedRequests: metrics.failedRequests,
					averageResponseTime: metrics.averageResponseTime,
					uniqueNamesCount: metrics.uniqueNamesCount,
				},
			});
		} catch (error) {
			console.error("Failed to update daily metrics:", error);
		}
	}

	private formatUptime(ms: number): string {
		const seconds = Math.floor((ms / 1000) % 60);
		const minutes = Math.floor((ms / (1000 * 60)) % 60);
		const hours = Math.floor((ms / (1000 * 60 * 60)) % 24);
		const days = Math.floor(ms / (1000 * 60 * 60 * 24));

		const parts = [];
		if (days > 0) parts.push(`${days}d`);
		if (hours > 0) parts.push(`${hours}h`);
		if (minutes > 0) parts.push(`${minutes}m`);
		if (seconds > 0) parts.push(`${seconds}s`);

		return parts.join(" ") || "0s";
	}
}
