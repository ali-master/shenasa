import type { PrismaClient } from "@prisma/client";

export interface AuditLogEntry {
	action: string;
	resource: string;
	resourceId?: string;
	userId?: string;
	apiKeyId?: string;
	ipAddress?: string;
	userAgent?: string;
	details?: Record<string, any>;
}

export class AuditLogger {
	constructor(private db: PrismaClient) {}

	async log(entry: AuditLogEntry): Promise<void> {
		try {
			await this.db.auditLog.create({
				data: {
					action: entry.action,
					resource: entry.resource,
					resourceId: entry.resourceId,
					userId: entry.userId,
					apiKeyId: entry.apiKeyId,
					ipAddress: entry.ipAddress,
					userAgent: entry.userAgent,
					details: entry.details ? JSON.stringify(entry.details) : null,
				},
			});
		} catch (error) {
			console.error("Failed to write audit log:", error);
		}
	}

	async getAuditLogs(
		filters: {
			action?: string;
			resource?: string;
			userId?: string;
			apiKeyId?: string;
			startDate?: Date;
			endDate?: Date;
			limit?: number;
		} = {},
	): Promise<
		Array<{
			id: string;
			action: string;
			resource: string;
			resourceId: string | null;
			userId: string | null;
			apiKeyId: string | null;
			ipAddress: string | null;
			userAgent: string | null;
			details: any;
			createdAt: Date;
		}>
	> {
		const where: any = {};

		if (filters.action) where.action = filters.action;
		if (filters.resource) where.resource = filters.resource;
		if (filters.userId) where.userId = filters.userId;
		if (filters.apiKeyId) where.apiKeyId = filters.apiKeyId;

		if (filters.startDate || filters.endDate) {
			where.createdAt = {};
			if (filters.startDate) where.createdAt.gte = filters.startDate;
			if (filters.endDate) where.createdAt.lte = filters.endDate;
		}

		const logs = await this.db.auditLog.findMany({
			where,
			orderBy: { createdAt: "desc" },
			take: filters.limit || 100,
		});

		return logs.map((log) => ({
			...log,
			details: log.details ? JSON.parse(log.details) : null,
		}));
	}

	async getAuditSummary(days = 30): Promise<{
		totalActions: number;
		actionsByType: Array<{ action: string; count: number }>;
		resourcesByType: Array<{ resource: string; count: number }>;
		topUsers: Array<{ userId: string; count: number }>;
		dailyActivity: Array<{ date: string; count: number }>;
	}> {
		const startDate = new Date();
		startDate.setDate(startDate.getDate() - days);

		const [totalActions, actionsByType, resourcesByType, topUsers, dailyActivity] =
			await Promise.all([
				this.db.auditLog.count({
					where: { createdAt: { gte: startDate } },
				}),
				this.db.auditLog.groupBy({
					by: ["action"],
					where: { createdAt: { gte: startDate } },
					_count: { action: true },
					orderBy: { _count: { action: "desc" } },
					take: 10,
				}),
				this.db.auditLog.groupBy({
					by: ["resource"],
					where: { createdAt: { gte: startDate } },
					_count: { resource: true },
					orderBy: { _count: { resource: "desc" } },
					take: 10,
				}),
				this.db.auditLog.groupBy({
					by: ["userId"],
					where: {
						createdAt: { gte: startDate },
						userId: { not: null },
					},
					_count: { userId: true },
					orderBy: { _count: { userId: "desc" } },
					take: 10,
				}),
				this.db.$queryRaw<Array<{ date: string; count: bigint }>>`
				SELECT
					DATE(createdAt) as date,
					COUNT(*) as count
				FROM AuditLog
				WHERE createdAt >= ${startDate.toISOString()}
				GROUP BY DATE(createdAt)
				ORDER BY date
			`,
			]);

		return {
			totalActions,
			actionsByType: actionsByType.map((item) => ({
				action: item.action,
				count: item._count.action,
			})),
			resourcesByType: resourcesByType.map((item) => ({
				resource: item.resource,
				count: item._count.resource,
			})),
			topUsers: topUsers.map((item) => ({
				userId: item.userId!,
				count: item._count.userId,
			})),
			dailyActivity: dailyActivity.map((item) => ({
				date: item.date,
				count: Number(item.count),
			})),
		};
	}
}

// Audit action types
export const AUDIT_ACTIONS = {
	CREATE: "CREATE",
	UPDATE: "UPDATE",
	DELETE: "DELETE",
	LOGIN: "LOGIN",
	LOGOUT: "LOGOUT",
	ACCESS: "ACCESS",
	EXPORT: "EXPORT",
	IMPORT: "IMPORT",
	CACHE_CLEAR: "CACHE_CLEAR",
	CACHE_WARM: "CACHE_WARM",
} as const;

// Audit resource types
export const AUDIT_RESOURCES = {
	API_KEY: "API_KEY",
	WEBHOOK: "WEBHOOK",
	NAME: "NAME",
	CACHE: "CACHE",
	EXPORT: "EXPORT",
	ALERT_RULE: "ALERT_RULE",
	CUSTOM_FIELD: "CUSTOM_FIELD",
	USER: "USER",
} as const;
