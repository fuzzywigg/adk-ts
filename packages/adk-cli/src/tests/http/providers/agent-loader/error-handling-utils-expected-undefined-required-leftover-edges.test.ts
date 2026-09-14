import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ErrorHandlingUtils } from "../../../../http/providers/agent-loader/error-handling-utils";

/**
 * Leftover: expected !== "undefined" drops those issues; throw path prefers
 * requiredMissing ?? allMissing (optional vars like NODE_ENV omitted).
 */
describe("ErrorHandlingUtils expected-undefined / requiredMissing ?? leftover edges", () => {
	it('Zod expected:"undefined" issues are filtered out → isMissing false', () => {
		const utils = new ErrorHandlingUtils({} as never);
		const err = new z.ZodError([
			{
				code: "invalid_type",
				expected: "undefined",
				received: "string",
				path: ["extra"],
				message: "Expected undefined",
			} as z.ZodIssue,
		]);
		expect(utils.isMissingEnvError(err)).toEqual({ isMissing: false });
	});

	it("throw lists requiredMissing only (not optional via ?? allMissing)", async () => {
		const utils = new ErrorHandlingUtils({
			error: () => undefined,
			warn: () => undefined,
		} as never);
		const schema = z.object({
			NODE_ENV: z.string(),
			api_key: z.string(),
		});
		let zodErr: z.ZodError | undefined;
		try {
			schema.parse({});
		} catch (e) {
			zodErr = e as z.ZodError;
		}
		expect(zodErr).toBeDefined();

		const check = utils.isMissingEnvError(zodErr);
		expect(check.requiredMissing).toEqual(["api_key"]);
		expect(check.optionalMissing).toEqual(expect.arrayContaining(["NODE_ENV"]));

		await expect(
			utils.handleImportError(zodErr, "/tmp/no-agent.cjs", "/tmp"),
		).rejects.toThrow(/Missing required environment variable: api_key/);

		try {
			await utils.handleImportError(zodErr, "/tmp/no-agent.cjs", "/tmp");
			expect.unreachable("expected throw");
		} catch (error) {
			expect(String(error)).not.toMatch(/NODE_ENV/);
		}
	});
});
