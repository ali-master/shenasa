import type { PrismaClient } from "@prisma/client";

export interface SimilarityResult {
	name: string;
	similarity: number;
	algorithm: string;
	gender?: "MALE" | "FEMALE" | "UNKNOWN";
	enName?: string;
}

export class MLSimilarity {
	constructor(private db: PrismaClient) {}

	// Levenshtein Distance algorithm
	private levenshteinDistance(str1: string, str2: string): number {
		const matrix = Array(str2.length + 1)
			.fill(null)
			.map(() => Array(str1.length + 1).fill(null));

		for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
		for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;

		for (let j = 1; j <= str2.length; j++) {
			for (let i = 1; i <= str1.length; i++) {
				const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
				matrix[j][i] = Math.min(
					matrix[j][i - 1] + 1, // deletion
					matrix[j - 1][i] + 1, // insertion
					matrix[j - 1][i - 1] + indicator, // substitution
				);
			}
		}

		return matrix[str2.length][str1.length];
	}

	// Jaro similarity algorithm
	private jaroSimilarity(str1: string, str2: string): number {
		if (str1 === str2) return 1.0;

		const len1 = str1.length;
		const len2 = str2.length;

		if (len1 === 0 || len2 === 0) return 0.0;

		const matchWindow = Math.floor(Math.max(len1, len2) / 2) - 1;
		if (matchWindow < 0) return 0.0;

		const str1Matches = new Array(len1).fill(false);
		const str2Matches = new Array(len2).fill(false);

		let matches = 0;
		let transpositions = 0;

		// Identify matches
		for (let i = 0; i < len1; i++) {
			const start = Math.max(0, i - matchWindow);
			const end = Math.min(i + matchWindow + 1, len2);

			for (let j = start; j < end; j++) {
				if (str2Matches[j] || str1[i] !== str2[j]) continue;
				str1Matches[i] = true;
				str2Matches[j] = true;
				matches++;
				break;
			}
		}

		if (matches === 0) return 0.0;

		// Count transpositions
		let k = 0;
		for (let i = 0; i < len1; i++) {
			if (!str1Matches[i]) continue;
			while (!str2Matches[k]) k++;
			if (str1[i] !== str2[k]) transpositions++;
			k++;
		}

		return (matches / len1 + matches / len2 + (matches - transpositions / 2) / matches) / 3.0;
	}

	// Jaro-Winkler similarity (enhances Jaro with common prefix)
	private jaroWinklerSimilarity(str1: string, str2: string): number {
		const jaroSim = this.jaroSimilarity(str1, str2);
		if (jaroSim < 0.7) return jaroSim;

		let prefixLength = 0;
		const maxPrefix = Math.min(4, Math.min(str1.length, str2.length));

		for (let i = 0; i < maxPrefix; i++) {
			if (str1[i] === str2[i]) {
				prefixLength++;
			} else {
				break;
			}
		}

		return jaroSim + 0.1 * prefixLength * (1 - jaroSim);
	}

	// Soundex algorithm (adapted for Persian names)
	private persianSoundex(name: string): string {
		// Simplified Persian Soundex - groups similar sounding letters
		const persianSoundMap: Record<string, string> = {
			ا: "1",
			آ: "1",
			أ: "1",
			إ: "1",
			ب: "2",
			پ: "2",
			ت: "3",
			ط: "3",
			ث: "3",
			ج: "4",
			چ: "4",
			ح: "5",
			خ: "5",
			د: "6",
			ذ: "6",
			ر: "7",
			ز: "7",
			ژ: "7",
			س: "8",
			ش: "8",
			ص: "8",
			ض: "8",
			ف: "9",
			ق: "9",
			ک: "0",
			گ: "0",
			ك: "0",
			ل: "L",
			م: "M",
			ن: "N",
			و: "W",
			ؤ: "W",
			ه: "H",
			ة: "H",
			ی: "Y",
			ي: "Y",
			ئ: "Y",
		};

		let soundex = "";
		for (const char of name) {
			const sound = persianSoundMap[char];
			if (sound && soundex[soundex.length - 1] !== sound) {
				soundex += sound;
			}
		}

		return soundex;
	}

	// Calculate similarity using multiple algorithms
	async calculateSimilarity(
		name1: string,
		name2: string,
	): Promise<{
		levenshtein: number;
		jaro: number;
		jaroWinkler: number;
		soundex: number;
		combined: number;
	}> {
		const normalizedName1 = name1.trim().toLowerCase();
		const normalizedName2 = name2.trim().toLowerCase();

		const maxLen = Math.max(normalizedName1.length, normalizedName2.length);
		const levenshteinSim =
			maxLen > 0 ? 1 - this.levenshteinDistance(normalizedName1, normalizedName2) / maxLen : 1;
		const jaroSim = this.jaroSimilarity(normalizedName1, normalizedName2);
		const jaroWinklerSim = this.jaroWinklerSimilarity(normalizedName1, normalizedName2);

		const soundex1 = this.persianSoundex(name1);
		const soundex2 = this.persianSoundex(name2);
		const soundexSim = soundex1 === soundex2 ? 1.0 : 0.0;

		// Weighted combination of algorithms
		const combined = levenshteinSim * 0.3 + jaroSim * 0.2 + jaroWinklerSim * 0.3 + soundexSim * 0.2;

		return {
			levenshtein: levenshteinSim,
			jaro: jaroSim,
			jaroWinkler: jaroWinklerSim,
			soundex: soundexSim,
			combined,
		};
	}

	async findSimilarNames(
		inputName: string,
		limit = 10,
		minSimilarity = 0.6,
	): Promise<SimilarityResult[]> {
		// First check if we have cached similarities
		const cached = await this.db.nameSimilarity.findMany({
			where: {
				name: inputName,
				similarity: { gte: minSimilarity },
			},
			orderBy: { similarity: "desc" },
			take: limit,
		});

		if (cached.length > 0) {
			// Get the actual name data
			const nameData = await this.db.persianName.findMany({
				where: {
					name: { in: cached.map((c) => c.similarName) },
				},
				select: {
					name: true,
					gender: true,
					enName: true,
				},
			});

			const nameMap = new Map(nameData.map((n) => [n.name, n]));

			return cached.map((c) => ({
				name: c.similarName,
				similarity: c.similarity,
				algorithm: c.algorithm,
				gender: nameMap.get(c.similarName)?.gender,
				enName: nameMap.get(c.similarName)?.enName || undefined,
			}));
		}

		// If not cached, compute similarities
		const allNames = await this.db.persianName.findMany({
			select: {
				name: true,
				gender: true,
				enName: true,
			},
			take: 1000, // Limit for performance
		});

		const similarities: Array<SimilarityResult & { similarityData: any }> = [];

		for (const nameRecord of allNames) {
			if (nameRecord.name === inputName) continue;

			const simData = await this.calculateSimilarity(inputName, nameRecord.name);

			if (simData.combined >= minSimilarity) {
				similarities.push({
					name: nameRecord.name,
					similarity: simData.combined,
					algorithm: "combined",
					gender: nameRecord.gender,
					enName: nameRecord.enName || undefined,
					similarityData: simData,
				});
			}
		}

		// Sort by similarity and take top results
		similarities.sort((a, b) => b.similarity - a.similarity);
		const topResults = similarities.slice(0, limit);

		// Cache the results for future use
		for (const result of topResults) {
			try {
				await this.db.nameSimilarity.upsert({
					where: {
						name_similarName_algorithm: {
							name: inputName,
							similarName: result.name,
							algorithm: "combined",
						},
					},
					update: {
						similarity: result.similarity,
					},
					create: {
						name: inputName,
						similarName: result.name,
						similarity: result.similarity,
						algorithm: "combined",
					},
				});
			} catch (error) {
				// Ignore cache errors
				console.warn("Failed to cache similarity:", error);
			}
		}

		return topResults.map(({ similarityData, ...result }) => result);
	}

	async suggestCorrections(inputName: string): Promise<{
		suggestions: SimilarityResult[];
		confidence: number;
		reasoning: string;
	}> {
		const similarNames = await this.findSimilarNames(inputName, 5, 0.7);

		let confidence = 0;
		let reasoning = "";

		if (similarNames.length === 0) {
			reasoning = "No similar names found in database";
		} else if (similarNames[0].similarity > 0.9) {
			confidence = 0.95;
			reasoning = "High similarity match found - likely spelling variation";
		} else if (similarNames[0].similarity > 0.8) {
			confidence = 0.8;
			reasoning = "Good similarity match found - possible typo or dialect variation";
		} else {
			confidence = 0.6;
			reasoning = "Moderate similarity matches found - may be related names";
		}

		return {
			suggestions: similarNames,
			confidence,
			reasoning,
		};
	}

	async precomputeSimilarities(batchSize = 100): Promise<void> {
		// Background job to precompute similarities for popular names
		const popularNames = await this.db.persianName.findMany({
			orderBy: { popularity: "desc" },
			take: 500,
			select: { name: true },
		});

		console.log(`Starting similarity precomputation for ${popularNames.length} names`);

		for (let i = 0; i < popularNames.length; i += batchSize) {
			const batch = popularNames.slice(i, i + batchSize);

			for (const nameRecord of batch) {
				try {
					await this.findSimilarNames(nameRecord.name, 20, 0.6);
				} catch (error) {
					console.error(`Failed to precompute similarities for ${nameRecord.name}:`, error);
				}
			}

			// Progress logging
			console.log(
				`Processed ${Math.min(i + batchSize, popularNames.length)}/${popularNames.length} names`,
			);

			// Small delay to prevent overwhelming the database
			await new Promise((resolve) => setTimeout(resolve, 100));
		}

		console.log("Similarity precomputation completed");
	}

	async getSimilarityStats(): Promise<{
		totalComputedSimilarities: number;
		averageSimilarity: number;
		algorithmDistribution: Array<{ algorithm: string; count: number }>;
		topSimilarPairs: Array<{
			name1: string;
			name2: string;
			similarity: number;
		}>;
	}> {
		const [totalCount, averageSim, algorithmStats, topPairs] = await Promise.all([
			this.db.nameSimilarity.count(),
			this.db.nameSimilarity.aggregate({
				_avg: { similarity: true },
			}),
			this.db.nameSimilarity.groupBy({
				by: ["algorithm"],
				_count: { algorithm: true },
			}),
			this.db.nameSimilarity.findMany({
				orderBy: { similarity: "desc" },
				take: 10,
				select: {
					name: true,
					similarName: true,
					similarity: true,
				},
			}),
		]);

		return {
			totalComputedSimilarities: totalCount,
			averageSimilarity: averageSim._avg.similarity || 0,
			algorithmDistribution: algorithmStats.map((stat) => ({
				algorithm: stat.algorithm,
				count: stat._count.algorithm,
			})),
			topSimilarPairs: topPairs.map((pair) => ({
				name1: pair.name,
				name2: pair.similarName,
				similarity: pair.similarity,
			})),
		};
	}
}
