import type { PrismaClient } from "@prisma/client";
// import { createUniqueId } from "./unique-id"; // Not used in this implementation

export interface ExportOptions {
	type: "names" | "metrics" | "logs" | "full" | "custom";
	format: "json" | "csv" | "sql";
	filters?: {
		startDate?: Date;
		endDate?: Date;
		gender?: "MALE" | "FEMALE" | "UNKNOWN";
		origin?: string;
		minPopularity?: number;
	};
	customQuery?: string;
}

export class DataExporter {
	constructor(private db: PrismaClient) {}

	async createExport(
		apiKeyId: string,
		options: ExportOptions,
	): Promise<{
		id: string;
		downloadUrl: string;
		estimatedSize: number;
	}> {
		// Create export record
		const exportRecord = await this.db.dataExport.create({
			data: {
				type: options.type,
				format: options.format,
				status: "pending",
				apiKeyId,
			},
		});

		// Start background processing
		this.processExport(exportRecord.id, options).catch((error) => {
			console.error(`Export ${exportRecord.id} failed:`, error);
			this.updateExportStatus(exportRecord.id, "failed");
		});

		return {
			id: exportRecord.id,
			downloadUrl: `/api/v1/exports/${exportRecord.id}/download`,
			estimatedSize: await this.estimateExportSize(options),
		};
	}

	private async processExport(exportId: string, options: ExportOptions): Promise<void> {
		await this.updateExportStatus(exportId, "processing");

		let data: any;
		let fileName: string;

		switch (options.type) {
			case "names":
				data = await this.exportNames(options);
				fileName = `names_export_${new Date().toISOString().split("T")[0]}`;
				break;
			case "metrics":
				data = await this.exportMetrics(options);
				fileName = `metrics_export_${new Date().toISOString().split("T")[0]}`;
				break;
			case "logs":
				data = await this.exportLogs(options);
				fileName = `logs_export_${new Date().toISOString().split("T")[0]}`;
				break;
			case "full":
				data = await this.exportFull(options);
				fileName = `full_export_${new Date().toISOString().split("T")[0]}`;
				break;
			default:
				throw new Error(`Unsupported export type: ${options.type}`);
		}

		const content = this.formatData(data, options.format);
		const fileExtension = options.format;
		const fullFileName = `${fileName}.${fileExtension}`;

		// In a real implementation, you would upload to cloud storage
		// For this example, we'll simulate the process
		const fileSize = Buffer.byteLength(content, "utf8");
		const downloadUrl = `https://exports.shenasa.dev/${exportId}/${fullFileName}`;

		await this.db.dataExport.update({
			where: { id: exportId },
			data: {
				status: "completed",
				fileName: fullFileName,
				fileSize,
				downloadUrl,
				expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
				completedAt: new Date(),
			},
		});
	}

	private async exportNames(options: ExportOptions): Promise<any[]> {
		const where: any = {};

		if (options.filters?.gender) {
			where.gender = options.filters.gender;
		}
		if (options.filters?.origin) {
			where.origin = options.filters.origin;
		}
		if (options.filters?.minPopularity) {
			where.popularity = { gte: options.filters.minPopularity };
		}

		return await this.db.persianName.findMany({
			where,
			select: {
				name: true,
				gender: true,
				enName: true,
				origin: true,
				abjadValue: true,
				popularity: true,
				isApproved: true,
				createdAt: true,
				updatedAt: true,
			},
			orderBy: { popularity: "desc" },
		});
	}

	private async exportMetrics(options: ExportOptions): Promise<any[]> {
		const where: any = {};

		if (options.filters?.startDate) {
			where.date = { gte: options.filters.startDate };
		}
		if (options.filters?.endDate) {
			where.date = { ...where.date, lte: options.filters.endDate };
		}

		return await this.db.systemMetrics.findMany({
			where,
			orderBy: { date: "desc" },
		});
	}

	private async exportLogs(options: ExportOptions): Promise<any[]> {
		const where: any = {};

		if (options.filters?.startDate) {
			where.createdAt = { gte: options.filters.startDate };
		}
		if (options.filters?.endDate) {
			where.createdAt = { ...where.createdAt, lte: options.filters.endDate };
		}

		return await this.db.requestLog.findMany({
			where,
			include: {
				persianName: {
					select: {
						name: true,
						gender: true,
						enName: true,
					},
				},
			},
			orderBy: { createdAt: "desc" },
			take: 10000, // Limit for performance
		});
	}

	private async exportFull(options: ExportOptions): Promise<{
		names: any[];
		metrics: any[];
		logs: any[];
		apiKeys: any[];
		metadata: any;
	}> {
		const [names, metrics, logs, apiKeys] = await Promise.all([
			this.exportNames(options),
			this.exportMetrics(options),
			this.exportLogs(options),
			this.db.apiKey.findMany({
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
			}),
		]);

		return {
			names,
			metrics,
			logs,
			apiKeys,
			metadata: {
				exportedAt: new Date().toISOString(),
				totalNames: names.length,
				totalMetrics: metrics.length,
				totalLogs: logs.length,
				totalApiKeys: apiKeys.length,
			},
		};
	}

	private formatData(data: any, format: "json" | "csv" | "sql"): string {
		switch (format) {
			case "json":
				return JSON.stringify(data, null, 2);
			case "csv":
				return this.convertToCSV(data);
			case "sql":
				return this.convertToSQL(data);
			default:
				throw new Error(`Unsupported format: ${format}`);
		}
	}

	private convertToCSV(data: any): string {
		if (!Array.isArray(data) || data.length === 0) {
			return "";
		}

		// Handle nested objects
		const flattenedData = data.map((item) => this.flattenObject(item));

		const headers = Object.keys(flattenedData[0]);
		const csvRows = [
			headers.join(","),
			...flattenedData.map((row) =>
				headers
					.map((header) => {
						const value = row[header];
						// Escape CSV special characters
						if (value === null || value === undefined) return "";
						const stringValue = String(value);
						if (
							stringValue.includes(",") ||
							stringValue.includes('"') ||
							stringValue.includes("\n")
						) {
							return `"${stringValue.replace(/"/g, '""')}"`;
						}
						return stringValue;
					})
					.join(","),
			),
		];

		return csvRows.join("\n");
	}

	private flattenObject(obj: any, prefix = ""): any {
		const flattened: any = {};

		for (const key in obj) {
			if (obj.hasOwnProperty(key)) {
				const value = obj[key];
				const newKey = prefix ? `${prefix}.${key}` : key;

				if (
					value !== null &&
					typeof value === "object" &&
					!Array.isArray(value) &&
					!(value instanceof Date)
				) {
					Object.assign(flattened, this.flattenObject(value, newKey));
				} else {
					flattened[newKey] = value;
				}
			}
		}

		return flattened;
	}

	private convertToSQL(data: any): string {
		if (!Array.isArray(data) || data.length === 0) {
			return "";
		}

		// This is a simplified SQL export - in practice, you'd want more sophisticated table detection
		const tableName = "exported_data";
		const columns = Object.keys(data[0]);

		let sql = `-- Exported data from Shenasa API\n`;
		sql += `-- Generated on ${new Date().toISOString()}\n\n`;

		sql += `CREATE TABLE IF NOT EXISTS ${tableName} (\n`;
		sql += columns.map((col) => `  ${col} TEXT`).join(",\n");
		sql += "\n);\n\n";

		for (const row of data) {
			const values = columns.map((col) => {
				const value = row[col];
				if (value === null || value === undefined) return "NULL";
				return `'${String(value).replace(/'/g, "''")}'`;
			});
			sql += `INSERT INTO ${tableName} (${columns.join(", ")}) VALUES (${values.join(", ")});\n`;
		}

		return sql;
	}

	private async estimateExportSize(options: ExportOptions): Promise<number> {
		let estimatedRows = 0;

		switch (options.type) {
			case "names":
				estimatedRows = await this.db.persianName.count();
				break;
			case "metrics":
				estimatedRows = await this.db.systemMetrics.count();
				break;
			case "logs":
				estimatedRows = Math.min(await this.db.requestLog.count(), 10000);
				break;
			case "full":
				const [names, metrics, logs] = await Promise.all([
					this.db.persianName.count(),
					this.db.systemMetrics.count(),
					this.db.requestLog.count(),
				]);
				estimatedRows = names + metrics + Math.min(logs, 10000);
				break;
		}

		// Rough estimation: average 200 bytes per row for JSON, 100 for CSV
		const bytesPerRow = options.format === "json" ? 200 : 100;
		return estimatedRows * bytesPerRow;
	}

	private async updateExportStatus(exportId: string, status: string): Promise<void> {
		await this.db.dataExport.update({
			where: { id: exportId },
			data: { status },
		});
	}

	async getExportStatus(exportId: string): Promise<{
		id: string;
		type: string;
		format: string;
		status: string;
		fileName?: string;
		fileSize?: number;
		downloadUrl?: string;
		expiresAt?: Date;
		createdAt: Date;
		completedAt?: Date;
	} | null> {
		const result = await this.db.dataExport.findUnique({
			where: { id: exportId },
		});

		if (!result) return null;

		return {
			...result,
			fileName: result.fileName || undefined,
			fileSize: result.fileSize || undefined,
			downloadUrl: result.downloadUrl || undefined,
			expiresAt: result.expiresAt || undefined,
			completedAt: result.completedAt || undefined,
		};
	}

	async listExports(apiKeyId: string): Promise<
		Array<{
			id: string;
			type: string;
			format: string;
			status: string;
			fileSize?: number;
			createdAt: Date;
			completedAt?: Date;
		}>
	> {
		const results = await this.db.dataExport.findMany({
			where: { apiKeyId },
			select: {
				id: true,
				type: true,
				format: true,
				status: true,
				fileSize: true,
				createdAt: true,
				completedAt: true,
			},
			orderBy: { createdAt: "desc" },
			take: 50,
		});

		return results.map((result) => ({
			...result,
			fileSize: result.fileSize || undefined,
			completedAt: result.completedAt || undefined,
		}));
	}

	async cleanupExpiredExports(): Promise<number> {
		const now = new Date();

		// In a real implementation, you would delete the actual files from storage here

		const deletedCount = await this.db.dataExport.deleteMany({
			where: {
				expiresAt: { lte: now },
				status: "completed",
			},
		});

		return deletedCount.count;
	}
}
