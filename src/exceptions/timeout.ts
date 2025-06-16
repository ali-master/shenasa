import { HTTPException } from "hono/http-exception";
// Types
import type { Context } from "hono";

export const HttpTimeoutException = (context: Context) =>
	new HTTPException(408, {
		message: `Request timeout after waiting ${context.req.header("Duration")} seconds. Please try again later.`,
	});
