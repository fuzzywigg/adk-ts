import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { ErrorHandlingUtils } from "../../../../http/providers/agent-loader/error-handling-utils";

/**
 * Leftover: !!v drops empty path segments; ADK_DEBUG_NEST must be exact "1";
 * error.name || "Error"; optionalPatterns are case-insensitive ADK_/NODE_ENV.
 */
describe("ErrorHandlingUtils path / debug / name leftover edges", () => {
	const originalDebug = process.env.ADK_DEBUG_NEST;

	afterEach(() => {
		if (originalDebug === undefined) {
			delete process.env.ADK_DEBUG_NEST;
		} else {
			process.env.ADK_DEBUG_NEST = originalDebug;
		}
	});

	it("drops falsy Zod path segments via !!v filter", () => {
		const utils = new ErrorHandlingUtils({} as never);
		const err = new z.ZodError([
			{
				code: "invalid_type",
				expected: "string",
				path: [""],
				message: "Required",
			} as z.ZodIssue,
			{
				code: "invalid_type",
				expected: "string",
				path: [0],
				message: "Required",
			} as z.ZodIssue,
		]);
		expect(utils.isMissingEnvError(err)).toEqual({ isMissing: false });
	});

	it("classifies NODE_ENV and adk_foo as optional (case-insensitive)", () => {
		const utils = new ErrorHandlingUtils({} as never);
		const schema = z.object({
			NODE_ENV: z.string(),
			adk_foo: z.string(),
			api_key: z.string(),
		});
		try {
			schema.parse({});
			expect.unreachable("expected ZodError");
		} catch (error) {
			const result = utils.isMissingEnvError(error);
			expect(result.isMissing).toBe(true);
			expect(result.optionalMissing).toEqual(
				expect.arrayContaining(["NODE_ENV", "adk_foo"]),
			);
			expect(result.requiredMissing).toEqual(["api_key"]);
			expect(result.hasOnlyOptionalMissing).toBe(false);
		}
	});

	it("only ADK_DEBUG_NEST === '1' prints stack (not true/01/1 )", () => {
		const utils = new ErrorHandlingUtils({} as never);
		const error = new Error("plain failure");
		error.stack = "STACK_LINE";

		for (const value of ["true", "1 ", "01", "0"]) {
			process.env.ADK_DEBUG_NEST = value;
			expect(utils.formatUserError(error)).not.toContain("Stack trace:");
		}

		process.env.ADK_DEBUG_NEST = "1";
		expect(utils.formatUserError(error)).toContain("Stack trace:");
		expect(utils.formatUserError(error)).toContain("STACK_LINE");
	});

	it("empty error.name falls back to title Error via ||", () => {
		const utils = new ErrorHandlingUtils({} as never);
		const error = new Error("mystery");
		error.name = "";
		const formatted = utils.formatUserError(error);
		expect(formatted).toContain("❌ Error");
		expect(formatted).not.toContain("Stack trace:");
	});

	it("Failed To Load Agent matches case-insensitive message includes", () => {
		const utils = new ErrorHandlingUtils({} as never);
		const error = new Error("Failed To Load Agent: boom");
		expect(utils.formatUserError(error)).toContain("Agent Loading Error");
	});
});
