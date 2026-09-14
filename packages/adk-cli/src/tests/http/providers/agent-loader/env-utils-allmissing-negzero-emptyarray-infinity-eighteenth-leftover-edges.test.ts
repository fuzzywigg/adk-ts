import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EnvUtils } from "../../../../http/providers/agent-loader/env-utils";

/**
 * Eighteenth leftover (logger/env residual HEAVY): generateEnvErrorMessage
 * `allMissing ||` SameValueZero `-0` fallthrough to varName; empty `[]` keeps
 * (no Required line); `NEGATIVE_INFINITY` / nonempty `[1]` asymmetries after
 * boolean-true / truthy-string join-throw port.
 */
describe("EnvUtils allMissing negzero/emptyarray/infinity eighteenth leftover", () => {
	const utils = new EnvUtils({ warn: () => {} } as never, true);

	it("allMissing=-0 falls through to varName (SameValueZero falsy)", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-allmiss-negzero-"));
		const message = utils.generateEnvErrorMessage(
			root,
			"API_KEY",
			-0 as unknown as string[],
		);
		expect(message).toContain("Required: API_KEY");
		expect(message).toContain("MISSING ENVIRONMENT VARIABLE\n");
		expect(message).not.toContain("VARIABLES");
	});

	it("allMissing=[] truthy empty → no Required line (length 0)", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-allmiss-empty-"));
		const message = utils.generateEnvErrorMessage(
			root,
			"API_KEY",
			[] as string[],
		);
		expect(message).toContain("MISSING ENVIRONMENT VARIABLE\n");
		expect(message).not.toContain("Required:");
		expect(message).not.toContain("API_KEY");
	});

	it("allMissing=NEGATIVE_INFINITY → for-of TypeError (not iterable)", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-allmiss-ninf-"));
		expect(() =>
			utils.generateEnvErrorMessage(
				root,
				"API_KEY",
				Number.NEGATIVE_INFINITY as unknown as string[],
			),
		).toThrow(/is not iterable/);
	});

	it("allMissing=[1] control still joins Required: 1", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-allmiss-one-"));
		const message = utils.generateEnvErrorMessage(root, "API_KEY", [
			"1",
		] as string[]);
		expect(message).toContain("Required: 1");
		expect(message).toContain("MISSING ENVIRONMENT VARIABLE\n");
	});

	it('varName="true" → Required: true (string; contrast boolean true port)', () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-varname-str-true-"));
		const message = utils.generateEnvErrorMessage(root, "true");
		expect(message).toContain("Required: true");
		expect(message).toContain("MISSING ENVIRONMENT VARIABLE\n");
	});
});
