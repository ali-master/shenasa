import { z } from "zod";

export const exceptionSchema = z.object({ code: z.number(), message: z.string() });
