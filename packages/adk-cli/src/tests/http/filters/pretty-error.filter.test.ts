import { ArgumentsHost, HttpException, HttpStatus } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { PrettyErrorFilter } from "../../../http/filters/pretty-error.filter";

function createHost(url = "/agents/demo") {
	const json = vi.fn();
	const status = vi.fn().mockReturnValue({ json });
	const host = {
		switchToHttp: () => ({
			getResponse: () => ({ status, json }),
			getRequest: () => ({ url }),
		}),
	} as unknown as ArgumentsHost;
	return { host, status, json };
}

describe("PrettyErrorFilter", () => {
	const originalDebugNest = process.env.ADK_DEBUG_NEST;

	afterEach(() => {
		if (originalDebugNest === undefined) {
			delete process.env.ADK_DEBUG_NEST;
		} else {
			process.env.ADK_DEBUG_NEST = originalDebugNest;
		}
	});

	it("maps ZodError to 400 validation error", () => {
		delete process.env.ADK_DEBUG_NEST;
		const filter = new PrettyErrorFilter(false);
		const { host, status, json } = createHost();
		const err = z.object({ name: z.string() }).safeParse({ name: 1 }).error!;

		filter.catch(err, host);

		expect(status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
		expect(json).toHaveBeenCalledWith(
			expect.objectContaining({
				error: "Validation Error",
				message: "Agent configuration or input validation failed",
				details: expect.arrayContaining([expect.stringContaining("name")]),
				path: "/agents/demo",
			}),
		);
	});

	it("forwards HttpException status and message", () => {
		const filter = new PrettyErrorFilter(false);
		const { host, status, json } = createHost("/x");
		filter.catch(new HttpException("Nope", HttpStatus.FORBIDDEN), host);

		expect(status).toHaveBeenCalledWith(HttpStatus.FORBIDDEN);
		expect(json).toHaveBeenCalledWith(
			expect.objectContaining({
				error: "HttpException",
				message: "Nope",
				path: "/x",
			}),
		);
	});

	it("categorizes agent loading errors as 500", () => {
		const filter = new PrettyErrorFilter(false);
		const { host, status, json } = createHost();
		filter.catch(new Error("Failed to load agent: boom"), host);

		expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
		expect(json).toHaveBeenCalledWith(
			expect.objectContaining({
				error: "Agent Loading Error",
				details: expect.any(Array),
			}),
		);
	});

	it("categorizes cannot find module errors", () => {
		const filter = new PrettyErrorFilter(false);
		const { host, status, json } = createHost();
		filter.catch(new Error("Cannot find module 'missing-pkg'"), host);

		expect(json).toHaveBeenCalledWith(
			expect.objectContaining({
				error: "Module Not Found",
				details: expect.arrayContaining([
					expect.stringContaining("missing-pkg"),
				]),
			}),
		);
		expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
	});

	it("categorizes agent not found as 404", () => {
		const filter = new PrettyErrorFilter(false);
		const { host, status, json } = createHost();
		filter.catch(new Error("Agent not found: foo"), host);

		expect(status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
		expect(json).toHaveBeenCalledWith(
			expect.objectContaining({ error: "Agent Not Found" }),
		);
	});

	it("categorizes session errors", () => {
		const filter = new PrettyErrorFilter(false);
		const { host, status, json } = createHost();
		filter.catch(new Error("Session expired"), host);

		expect(json).toHaveBeenCalledWith(
			expect.objectContaining({ error: "Session Error" }),
		);
	});

	it("categorizes runtime / execution errors", () => {
		const filter = new PrettyErrorFilter(false);
		const { host, status, json } = createHost();
		filter.catch(new Error("Failed executing agent runtime step"), host);

		expect(json).toHaveBeenCalledWith(
			expect.objectContaining({
				error: "Agent Runtime Error",
				details: expect.any(Array),
			}),
		);
	});

	it("categorizes SyntaxError and TypeError", () => {
		const filter = new PrettyErrorFilter(false);

		const syntaxHost = createHost();
		filter.catch(new SyntaxError("Unexpected token"), syntaxHost.host);
		expect(syntaxHost.json).toHaveBeenCalledWith(
			expect.objectContaining({ error: "Syntax Error" }),
		);

		const typeHost = createHost();
		filter.catch(
			new TypeError("Cannot read properties of null"),
			typeHost.host,
		);
		expect(typeHost.json).toHaveBeenCalledWith(
			expect.objectContaining({ error: "Type Error" }),
		);
	});

	it("maps invalid/validation messages to 400", () => {
		const filter = new PrettyErrorFilter(false);
		const { host, status } = createHost();
		filter.catch(new Error("Invalid configuration value"), host);
		expect(status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
	});

	it("includes stack when ADK_DEBUG_NEST=1", () => {
		process.env.ADK_DEBUG_NEST = "1";
		const filter = new PrettyErrorFilter(false);
		const { host, status, json } = createHost();
		const err = new Error("boom");
		filter.catch(err, host);

		expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
		expect(json).toHaveBeenCalledWith(
			expect.objectContaining({
				stack: expect.stringContaining("boom"),
			}),
		);
	});

	it("handles unknown non-Error exceptions", () => {
		const filter = new PrettyErrorFilter(false);
		const { host, status, json } = createHost();
		filter.catch("plain-string", host);

		expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
		expect(json).toHaveBeenCalledWith(
			expect.objectContaining({
				error: "Internal Server Error",
				details: ["plain-string"],
			}),
		);
	});
});
