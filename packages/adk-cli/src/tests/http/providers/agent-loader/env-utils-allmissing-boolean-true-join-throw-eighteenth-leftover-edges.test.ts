import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EnvUtils } from "../../../../http/providers/agent-loader/env-utils";

/**
 * Eighteenth leftover (logger/env residual): generateEnvErrorMessage `allMissing ||`
 * keeps truthy boolean `true` (for-of not-iterable; no `.length` so skips join)
 * and truthy strings `"true"`/`"false"`/`"0"` → `.join` TypeError. Contrast
 * sixteenth falsy `false`/`0`/`""` fallthrough to varName. Also varName boolean
 * `true` → Required: true.
 */
describe("EnvUtils allMissing/varName boolean-true throw eighteenth leftover", () => {
	const utils = new EnvUtils({ warn: () => {} } as never, true);

	it("allMissing=true (boolean) → for-of TypeError (no .length, skips join)", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-allmiss-bool-"));
		expect(() =>
			utils.generateEnvErrorMessage(
				root,
				"API_KEY",
				true as unknown as string[],
			),
		).toThrow(/is not iterable/);
	});

	it.each([
		{ label: '"true"', allMissing: "true" },
		{ label: '"false"', allMissing: "false" },
		{ label: '"0"', allMissing: "0" },
	] as const)("allMissing=$label truthy string → .join TypeError", ({
		allMissing,
	}) => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-allmiss-str-"));
		expect(() =>
			utils.generateEnvErrorMessage(
				root,
				"API_KEY",
				allMissing as unknown as string[],
			),
		).toThrow(/join is not a function/);
	});

	it("varName=true → Required: true (boolean coerced in join)", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-varname-true-"));
		const message = utils.generateEnvErrorMessage(root, true as any);
		expect(message).toContain("Required: true");
		expect(message).toContain("MISSING ENVIRONMENT VARIABLE\n");
		expect(message).not.toContain("VARIABLES");
	});

	it("allMissing:false control still falls through to varName (sixteenth)", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-allmiss-false-ctrl-"));
		const message = utils.generateEnvErrorMessage(
			root,
			"API_KEY",
			false as unknown as string[],
		);
		expect(message).toContain("Required: API_KEY");
	});
});
