// test/index.spec.ts
import { env, createExecutionContext, waitOnExecutionContext, SELF } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import worker from "../src/index";

// For now, you'll need to do something like this to get a correctly-typed
// `Request` to pass to `worker.fetch()`.
const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

describe("Shenasa API worker", () => {
	it("responds with health check (unit style)", async () => {
		const request = new IncomingRequest("http://example.com/api/v1/health");
		// Create an empty context to pass to `worker.fetch()`.
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		// Wait for all `Promise`s passed to `ctx.waitUntil()` to settle before running test assertions
		await waitOnExecutionContext(ctx);
		const data = await response.json();
		expect(response.status).toBe(200);
		expect(data.version).toBe("2.0.0");
		expect(data.status).toMatch(/healthy|degraded|unhealthy/);
	});

	it("responds with health check (integration style)", async () => {
		const response = await SELF.fetch("https://example.com/api/v1/health");
		const data = await response.json();
		expect(response.status).toBe(200);
		expect(data.version).toBe("2.0.0");
		expect(data.status).toMatch(/healthy|degraded|unhealthy/);
	});

	it("returns 404 for unknown routes", async () => {
		const response = await SELF.fetch("https://example.com/unknown-route");
		expect(response.status).toBe(404);
	});

	it("serves OpenAPI documentation", async () => {
		const response = await SELF.fetch("https://example.com/api/v1/openapi");
		expect(response.status).toBe(200);
		const data = await response.json();
		expect(data.openapi).toBe("3.0.0");
		expect(data.info.title).toBe("Shenasa API");
		expect(data.info.version).toBe("2.0.0");
	});

	it("serves API documentation", async () => {
		const response = await SELF.fetch("https://example.com/api/v1/docs");
		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toContain("text/html");
	});
});
