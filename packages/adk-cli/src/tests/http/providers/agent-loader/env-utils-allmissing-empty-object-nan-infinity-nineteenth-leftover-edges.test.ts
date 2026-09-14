import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Logger } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { EnvUtils } from "../../../../http/providers/agent-loader/env-utils";

/**
 * Nineteenth leftover (HEAVY tip-relaunch residual after #253):
 * `allMissing || (varName ? …)` — eighteenth pinned true/`1`/`"true"`/`-0`/
 * `[]`. Residual: empty `{}` / Infinity Found-path no Required + Create
 * for-of throw; NaN falls through; `"false"` `.join` throw; varName peers.
 */
describe("EnvUtils allMissing empty-object/nan/infinity nineteenth leftover", () => {
	const utils = new EnvUtils(new Logger("EnvUtils19hTest"), true);

	it("allMissing: empty object + Found .env → singular, no Required, no throw", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-obj-found-"));
		writeFileSync(join(root, ".env"), "X=1\n");
		const message = utils.generateEnvErrorMessage(
			root,
			"FALLBACK",
			{} as unknown as string[],
		);
		expect(message).toContain("MISSING ENVIRONMENT VARIABLE\n");
		expect(message).not.toContain("VARIABLES");
		expect(message).not.toContain("Required:");
		expect(message).not.toContain("FALLBACK");
		expect(message).toContain("Found: .env");
	});

	it("allMissing: Infinity + Found .env same undefined-length residual", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-inf-found-"));
		writeFileSync(join(root, ".env"), "X=1\n");
		const message = utils.generateEnvErrorMessage(
			root,
			"FALLBACK",
			Number.POSITIVE_INFINITY as unknown as string[],
		);
		expect(message).not.toContain("Required:");
		expect(message).not.toContain("FALLBACK");
		expect(message).toContain("Found: .env");
	});

	it("allMissing: empty object + no env files → Create path for-of throws", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-obj-create-"));
		expect(() =>
			utils.generateEnvErrorMessage(
				root,
				"FALLBACK",
				{} as unknown as string[],
			),
		).toThrow(/not iterable/);
	});

	it("allMissing: Infinity + no env files → Create path for-of throws", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-inf-create-"));
		expect(() =>
			utils.generateEnvErrorMessage(
				root,
				"FALLBACK",
				Number.POSITIVE_INFINITY as unknown as string[],
			),
		).toThrow(/not iterable/);
	});

	it('allMissing: string "false" wins || then throws on .join', () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-str-false-all-"));
		writeFileSync(join(root, ".env"), "X=1\n");
		expect(() =>
			utils.generateEnvErrorMessage(
				root,
				"FALLBACK",
				"false" as unknown as string[],
			),
		).toThrow(/join is not a function/);
	});

	it("allMissing: NaN falls through to varName via || (falsy twin of -0)", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-nan-all-"));
		const message = utils.generateEnvErrorMessage(
			root,
			"FALLBACK",
			Number.NaN as unknown as string[],
		);
		expect(message).toContain("Required: FALLBACK");
		expect(message).toContain("MISSING ENVIRONMENT VARIABLE\n");
		expect(message).not.toContain("VARIABLES");
	});

	it.each([
		{ label: "boolean true", varName: true, required: "Required: true" },
		{ label: "peers 1", varName: 1, required: "Required: 1" },
		{ label: '"1"', varName: "1", required: "Required: 1" },
	] as const)("varName=$label wins when allMissing undefined", ({
		varName,
		required,
	}) => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-vn-"));
		const message = utils.generateEnvErrorMessage(
			root,
			varName as unknown as string,
		);
		expect(message).toContain(required);
		expect(message).toContain("MISSING ENVIRONMENT VARIABLE\n");
		expect(message).not.toContain("VARIABLES");
	});

	it.each([
		{ label: "-0", varName: -0 },
		{ label: "NaN", varName: Number.NaN },
	] as const)("varName=$label falsy → no Required line", ({ varName }) => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-vn-falsy-"));
		const message = utils.generateEnvErrorMessage(
			root,
			varName as unknown as string,
		);
		expect(message).not.toContain("Required:");
		expect(message).toContain("MISSING ENVIRONMENT VARIABLE\n");
	});
});
