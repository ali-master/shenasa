import { z } from "zod";
import { isFarsi, isArabic } from "@persian-tools/persian-tools";

export const getGenderByNameResponseSchema = z.object({
	gender: z.string().nullable(),
	enName: z.string().nullable(),
});

export const getGenderByNameRequestParamsSchema = z
	.object({
		name: z
			.string({
				required_error: "name is required",
				invalid_type_error: "name must be a string",
			})
			.trim()
			.min(3, "name must be at least 3 characters long")
			.max(50, "name must be at most 50 characters long"),
	})
	.refine(({ name }) => isFarsi(name) || isArabic(name), {
		message: "name must be a Persian or Arabic name",
	});
