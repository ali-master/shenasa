import { PrismaClient } from "@prisma/client";
import { PrismaD1 } from "@prisma/adapter-d1";

export const prismaClient = {
	async fetch(db: D1Database) {
		const adapter = new PrismaD1(db);

		return new PrismaClient({
			adapter,
			errorFormat: "pretty",
			transactionOptions: {
				maxWait: 10_000,
				timeout: 10_000,
			},
		});
	},
};
