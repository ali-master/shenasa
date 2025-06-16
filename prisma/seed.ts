#!/usr/bin/env node

import { readFileSync } from "fs";
import { join } from "path";
import { PrismaClient } from "@prisma/client";

interface CSVRow {
	name: string;
	gender: "MALE" | "FEMALE" | "UNKNOWN";
	enName?: string;
	origin?: string;
	abjadValue?: number;
	popularity?: number;
}

class DatabaseSeeder {
	private db: PrismaClient;

	constructor() {
		// For CLI usage, we'll use a local SQLite database
		this.db = new PrismaClient({
			datasources: {
				db: {
					url: process.env.DATABASE_URL || "file:./dev.db",
				},
			},
		});
	}

	async seed(): Promise<void> {
		console.log("🌱 Starting database seeding...");

		try {
			// Clear existing data
			await this.clearData();

			// Process all CSV files
			const datasets = [
				{
					file: "data/persian-gender-by-name.csv",
					parser: this.parsePersianGenderCSV.bind(this),
				},
				{
					file: "data/iranianNamesDataset.csv",
					parser: this.parseIranianNamesCSV.bind(this),
				},
				{
					file: "data/names.csv",
					parser: this.parseNamesCSV.bind(this),
				},
			];

			const allNames = new Map<string, CSVRow>();

			for (const dataset of datasets) {
				const filePath = join(process.cwd(), dataset.file);
				const data = this.parseCSV(dataset.parser, filePath);

				console.log(`📄 Processing ${dataset.file}: ${data.length} records`);

				for (const row of data) {
					const key = `${row.name}-${row.gender}`;
					const existing = allNames.get(key);

					if (existing) {
						// Merge data, preferring more complete records
						allNames.set(key, {
							...existing,
							...row,
							enName: row.enName || existing.enName,
							origin: row.origin || existing.origin,
							abjadValue: row.abjadValue || existing.abjadValue,
							popularity: Math.max(row.popularity || 0, existing.popularity || 0),
						});
					} else {
						allNames.set(key, row);
					}
				}
			}

			// Insert data in batches
			const batchSize = 1000;
			const names = Array.from(allNames.values());

			console.log(`💾 Inserting ${names.length} unique names...`);

			for (let i = 0; i < names.length; i += batchSize) {
				const batch = names.slice(i, i + batchSize);
				await this.insertBatch(batch);
				console.log(`   Inserted ${Math.min(i + batchSize, names.length)}/${names.length} records`);
			}

			console.log("✅ Database seeding completed successfully!");
			console.log(`📊 Total records: ${names.length}`);

			// Generate summary statistics
			await this.generateStats();
		} catch (error) {
			console.error("❌ Seeding failed:", error);
			throw error;
		} finally {
			await this.db.$disconnect();
		}
	}

	private async clearData(): Promise<void> {
		console.log("🧹 Clearing existing data...");
		await this.db.persianName.deleteMany({});
	}

	private parseCSV<T>(parser: (content: string) => T[], filePath: string): T[] {
		try {
			const content = readFileSync(filePath, "utf-8");
			return parser(content);
		} catch (error) {
			console.warn(`⚠️  Could not read ${filePath}: ${error}`);
			return [];
		}
	}

	private parsePersianGenderCSV(content: string): CSVRow[] {
		const lines = content.trim().split("\n");
		const rows: CSVRow[] = [];

		for (let i = 1; i < lines.length; i++) {
			const [name, gender, enName] = lines[i].split(",");
			if (name && gender) {
				rows.push({
					name: name.trim(),
					gender:
						gender.trim().toLowerCase() === "m"
							? "MALE"
							: gender.trim().toLowerCase() === "f"
								? "FEMALE"
								: "UNKNOWN",
					enName: enName?.trim() || undefined,
				});
			}
		}

		return rows;
	}

	private parseIranianNamesCSV(content: string): CSVRow[] {
		const lines = content.trim().split("\n");
		const rows: CSVRow[] = [];

		for (let i = 1; i < lines.length; i++) {
			// Handle CSV with quotes
			const match = lines[i].match(/"([^"]+)","([^"]+)"/);
			if (match) {
				const [, name, gender] = match;
				rows.push({
					name: name.trim(),
					gender: gender.trim() === "M" ? "MALE" : gender.trim() === "F" ? "FEMALE" : "UNKNOWN",
				});
			}
		}

		return rows;
	}

	private parseNamesCSV(content: string): CSVRow[] {
		const lines = content.trim().split("\n");
		const rows: CSVRow[] = [];

		for (let i = 1; i < lines.length; i++) {
			const parts = lines[i].split(",");
			if (parts.length >= 8) {
				const [gender, eng, count, pr_fa, abjad, , origin] = parts;

				if (pr_fa && gender) {
					rows.push({
						name: pr_fa.trim(),
						gender:
							gender.trim() === "دختر" ? "FEMALE" : gender.trim() === "پسر" ? "MALE" : "UNKNOWN",
						enName: eng?.trim() || undefined,
						origin: origin?.trim() || undefined,
						abjadValue: abjad ? parseInt(abjad.trim()) : undefined,
						popularity: count ? parseInt(count.trim()) : undefined,
					});
				}
			}
		}

		return rows;
	}

	private async insertBatch(batch: CSVRow[]): Promise<void> {
		const data = batch.map((row) => ({
			name: row.name,
			gender: row.gender,
			enName: row.enName,
			origin: row.origin,
			abjadValue: row.abjadValue,
			popularity: row.popularity || 0,
		}));

		await this.db.persianName.createMany({
			data,
		});
	}

	private async generateStats(): Promise<void> {
		const [total, male, female, unknown, withEnglish, withOrigin] = await Promise.all([
			this.db.persianName.count(),
			this.db.persianName.count({ where: { gender: "MALE" } }),
			this.db.persianName.count({ where: { gender: "FEMALE" } }),
			this.db.persianName.count({ where: { gender: "UNKNOWN" } }),
			this.db.persianName.count({ where: { enName: { not: null } } }),
			this.db.persianName.count({ where: { origin: { not: null } } }),
		]);

		console.log("\n📈 Database Statistics:");
		console.log(`   Total names: ${total}`);
		console.log(`   Male names: ${male} (${((male / total) * 100).toFixed(1)}%)`);
		console.log(`   Female names: ${female} (${((female / total) * 100).toFixed(1)}%)`);
		console.log(`   Unknown gender: ${unknown} (${((unknown / total) * 100).toFixed(1)}%)`);
		console.log(
			`   With English names: ${withEnglish} (${((withEnglish / total) * 100).toFixed(1)}%)`,
		);
		console.log(`   With origin info: ${withOrigin} (${((withOrigin / total) * 100).toFixed(1)}%)`);
	}
}

// CLI interface
async function main() {
	const args = process.argv.slice(2);
	const command = args[0];

	if (command === "seed" || !command) {
		const seeder = new DatabaseSeeder();
		await seeder.seed();
	} else {
		console.log("Usage: npm run seed");
		console.log("   or: node dist/seeder.js seed");
		process.exit(1);
	}
}

// Run if called directly
if (require.main === module) {
	main().catch((error) => {
		console.error("❌ Seeder failed:", error);
		process.exit(1);
	});
}

export { DatabaseSeeder };
