import type { PrismaClient } from "@prisma/client";

export interface GeographicData {
	country: string;
	region?: string;
	city?: string;
	latitude?: number;
	longitude?: number;
}

export class GeoAnalytics {
	constructor(private db: PrismaClient) {}

	parseCloudflareHeaders(headers: Headers): GeographicData {
		return {
			country: headers.get("cf-ipcountry") || "Unknown",
			region: headers.get("cf-region") || undefined,
			city: headers.get("cf-ipcity") || undefined,
			latitude: headers.get("cf-iplatitude")
				? parseFloat(headers.get("cf-iplatitude")!)
				: undefined,
			longitude: headers.get("cf-iplongitude")
				? parseFloat(headers.get("cf-iplongitude")!)
				: undefined,
		};
	}

	async updateGeographicStats(geoData: GeographicData, requestedName?: string): Promise<void> {
		try {
			const today = new Date();
			today.setHours(0, 0, 0, 0);

			// Get existing stats for today
			const existing = await this.db.geographicStats.findFirst({
				where: {
					country: geoData.country,
					region: geoData.region,
					city: geoData.city,
					date: today,
				},
			});

			if (existing) {
				// Update existing stats
				const popularNames = existing.popularNames ? JSON.parse(existing.popularNames) : {};
				if (requestedName) {
					popularNames[requestedName] = (popularNames[requestedName] || 0) + 1;
				}

				await this.db.geographicStats.update({
					where: { id: existing.id },
					data: {
						requestCount: { increment: 1 },
						popularNames: JSON.stringify(popularNames),
					},
				});
			} else {
				// Create new stats entry
				const popularNames = requestedName ? { [requestedName]: 1 } : {};

				await this.db.geographicStats.create({
					data: {
						country: geoData.country,
						region: geoData.region,
						city: geoData.city,
						requestCount: 1,
						uniqueUsers: 1,
						popularNames: JSON.stringify(popularNames),
						date: today,
					},
				});
			}
		} catch (error) {
			console.error("Failed to update geographic stats:", error);
		}
	}

	async getGeographicInsights(days = 30): Promise<{
		totalCountries: number;
		totalRequests: number;
		topCountries: Array<{
			country: string;
			requestCount: number;
			percentage: number;
		}>;
		topRegions: Array<{
			country: string;
			region: string;
			requestCount: number;
		}>;
		topCities: Array<{
			country: string;
			city: string;
			requestCount: number;
		}>;
		popularNamesByCountry: Array<{
			country: string;
			popularNames: Array<{ name: string; count: number }>;
		}>;
		dailyGeoTrends: Array<{
			date: string;
			countries: number;
			requests: number;
		}>;
	}> {
		const startDate = new Date();
		startDate.setDate(startDate.getDate() - days);

		const [countryStats, regionStats, cityStats, dailyStats] = await Promise.all([
			this.db.geographicStats.groupBy({
				by: ["country"],
				where: { date: { gte: startDate } },
				_sum: { requestCount: true },
				orderBy: { _sum: { requestCount: "desc" } },
				take: 20,
			}),
			this.db.geographicStats.groupBy({
				by: ["country", "region"],
				where: {
					date: { gte: startDate },
					region: { not: null },
				},
				_sum: { requestCount: true },
				orderBy: { _sum: { requestCount: "desc" } },
				take: 15,
			}),
			this.db.geographicStats.groupBy({
				by: ["country", "city"],
				where: {
					date: { gte: startDate },
					city: { not: null },
				},
				_sum: { requestCount: true },
				orderBy: { _sum: { requestCount: "desc" } },
				take: 15,
			}),
			this.db.$queryRaw<Array<{ date: string; countries: bigint; requests: bigint }>>`
				SELECT 
					DATE(date) as date,
					COUNT(DISTINCT country) as countries,
					SUM(requestCount) as requests
				FROM GeographicStats 
				WHERE date >= ${startDate.toISOString()}
				GROUP BY DATE(date)
				ORDER BY date
			`,
		]);

		const totalRequests = countryStats.reduce(
			(sum, stat) => sum + (stat._sum.requestCount || 0),
			0,
		);

		// Get popular names by country
		const popularNamesByCountry = await this.getPopularNamesByCountry(startDate);

		return {
			totalCountries: countryStats.length,
			totalRequests,
			topCountries: countryStats.map((stat) => ({
				country: stat.country,
				requestCount: stat._sum.requestCount || 0,
				percentage: totalRequests > 0 ? ((stat._sum.requestCount || 0) / totalRequests) * 100 : 0,
			})),
			topRegions: regionStats.map((stat) => ({
				country: stat.country,
				region: stat.region!,
				requestCount: stat._sum.requestCount || 0,
			})),
			topCities: cityStats.map((stat) => ({
				country: stat.country,
				city: stat.city!,
				requestCount: stat._sum.requestCount || 0,
			})),
			popularNamesByCountry,
			dailyGeoTrends: dailyStats.map((stat) => ({
				date: stat.date,
				countries: Number(stat.countries),
				requests: Number(stat.requests),
			})),
		};
	}

	private async getPopularNamesByCountry(startDate: Date): Promise<
		Array<{
			country: string;
			popularNames: Array<{ name: string; count: number }>;
		}>
	> {
		const geoStats = await this.db.geographicStats.findMany({
			where: {
				date: { gte: startDate },
				popularNames: { not: null as any },
			},
			select: {
				country: true,
				popularNames: true,
			},
		});

		const countryNames: Record<string, Record<string, number>> = {};

		for (const stat of geoStats) {
			if (!stat.popularNames) continue;

			const names = JSON.parse(stat.popularNames);
			if (!countryNames[stat.country]) {
				countryNames[stat.country] = {};
			}

			for (const [name, count] of Object.entries(names)) {
				countryNames[stat.country][name] =
					(countryNames[stat.country][name] || 0) + (count as number);
			}
		}

		return Object.entries(countryNames).map(([country, names]) => ({
			country,
			popularNames: Object.entries(names)
				.map(([name, count]) => ({ name, count }))
				.sort((a, b) => b.count - a.count)
				.slice(0, 10),
		}));
	}

	async getCountryCodeMapping(): Promise<Record<string, string>> {
		// Basic country code to name mapping
		return {
			US: "United States",
			CA: "Canada",
			GB: "United Kingdom",
			DE: "Germany",
			FR: "France",
			IT: "Italy",
			ES: "Spain",
			AU: "Australia",
			JP: "Japan",
			CN: "China",
			IN: "India",
			BR: "Brazil",
			RU: "Russia",
			IR: "Iran",
			TR: "Turkey",
			AE: "United Arab Emirates",
			SA: "Saudi Arabia",
			EG: "Egypt",
			PK: "Pakistan",
			AF: "Afghanistan",
			// Add more as needed
		};
	}

	async getGeoHeatmapData(days = 30): Promise<
		Array<{
			country: string;
			countryName: string;
			requestCount: number;
			intensity: number; // 0-1 scale for heatmap
		}>
	> {
		const startDate = new Date();
		startDate.setDate(startDate.getDate() - days);

		const countryStats = await this.db.geographicStats.groupBy({
			by: ["country"],
			where: { date: { gte: startDate } },
			_sum: { requestCount: true },
			orderBy: { _sum: { requestCount: "desc" } },
		});

		const maxRequests = Math.max(...countryStats.map((stat) => stat._sum.requestCount || 0));
		const countryMapping = await this.getCountryCodeMapping();

		return countryStats.map((stat) => ({
			country: stat.country,
			countryName: countryMapping[stat.country] || stat.country,
			requestCount: stat._sum.requestCount || 0,
			intensity: maxRequests > 0 ? (stat._sum.requestCount || 0) / maxRequests : 0,
		}));
	}
}
