import { ArgumentsHost, HttpException, HttpStatus } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { PrettyErrorFilter } from "../../../http/filters/pretty-error.filter";

function createHost(url = "/leftover") {
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

describe("PrettyErrorFilter root / http-string leftover edges", () => {
	const originalDebugNest = process.env.ADK_DEBUG_NEST;

	afterEach(() => {
		if (originalDebugNest === undefined) {
			delete process.env.ADK_DEBUG_NEST;
		} else {
			process.env.ADK_DEBUG_NEST = originalDebugNest;
		}
		vi.restoreAllMocks();
	});

	it("maps Zod issues with an empty path to (root)", () => {
		delete process.env.ADK_DEBUG_NEST;
		const filter = new PrettyErrorFilter(false);
		const { host, json } = createHost();
		const err = z.string().safeParse(1).error!;
		filter.catch(err, host);
		expect(json).toHaveBeenCalledWith(
			expect.objectContaining({
				details: expect.arrayContaining([expect.stringContaining("(root)")]),
			}),
		);
	});

	it("uses HttpException.getResponse() string bodies", () => {
		const filter = new PrettyErrorFilter(false);
		const { host, json } = createHost();
		filter.catch(new HttpException("plain-body", HttpStatus.CONFLICT), host);
		expect(json).toHaveBeenCalledWith(
			expect.objectContaining({
				message: "Plain-body",
				error: "HttpException",
			}),
		);
	});

	it("falls back to exception.message when the response object has no message", () => {
		const filter = new PrettyErrorFilter(false);
		const { host, json } = createHost();
		filter.catch(
			new HttpException({ error: "only-error-key" }, HttpStatus.BAD_GATEWAY),
			host,
		);
		expect(json).toHaveBeenCalledWith(
			expect.objectContaining({
				message: expect.any(String),
			}),
		);
	});

	it("adds Cannot find module details on agent-loading errors", () => {
		const filter = new PrettyErrorFilter(false);
		const { host, json } = createHost();
		filter.catch(
			new Error("Failed to load agent: Cannot find module 'left-pkg'"),
			host,
		);
		expect(json).toHaveBeenCalledWith(
			expect.objectContaining({
				error: "Agent Loading Error",
				details: expect.arrayContaining([
					expect.stringContaining("dependencies are installed"),
				]),
			}),
		);
	});

	it("uses the generic agent.ts hint when loading details are empty", () => {
		const filter = new PrettyErrorFilter(false);
		const { host, json } = createHost();
		filter.catch(new Error("Failed to import compiled agent"), host);
		expect(json).toHaveBeenCalledWith(
			expect.objectContaining({
				details: ["💡 Check your agent.ts file for errors"],
			}),
		);
	});

	it("warns for 4xx and errors for 5xx", () => {
		const warn = vi.fn();
		const error = vi.fn();
		const filter = new PrettyErrorFilter(false);
		(
			filter as unknown as {
				logger: { warn: typeof warn; error: typeof error };
			}
		).logger = { warn, error };

		filter.catch(
			new HttpException("nope", HttpStatus.BAD_REQUEST),
			createHost().host,
		);
		expect(warn).toHaveBeenCalled();

		filter.catch(new Error("boom"), createHost().host);
		expect(error).toHaveBeenCalled();
	});

	it("prettifies Error: prefixes and empty messages", () => {
		const filter = new PrettyErrorFilter(false);
		const { host, json } = createHost();
		filter.catch(new Error("Error: exploded"), host);
		expect(json).toHaveBeenCalledWith(
			expect.objectContaining({
				message: "Exploded",
			}),
		);
	});

	it("uses Error as the generic title when name is empty", () => {
		const filter = new PrettyErrorFilter(false);
		const { host, json } = createHost();
		const err = new Error("nameless");
		err.name = "";
		filter.catch(err, host);
		expect(json).toHaveBeenCalledWith(
			expect.objectContaining({ error: "Error" }),
		);
	});
});
