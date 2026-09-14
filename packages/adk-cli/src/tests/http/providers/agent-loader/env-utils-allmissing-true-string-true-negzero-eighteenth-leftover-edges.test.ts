import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Logger } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { EnvUtils } from "../../../../http/providers/agent-loader/env-utils";

/**
 * Eighteenth leftover (HEAVY tip-relaunch residual after #227):
 * `allMissing || (varName ? …)` — fifteenth pinned `null` fallthrough and
 * truthy `[]` win. Residual: boolean `true` / number `1` win with undefined
 * `.length` → singular + no Required (Found path); Create path throws on
 * `for…of`; string `"true"` throws on `.join`; `-0` falls through to varName.
 */
describe("EnvUtils allMissing true/string-true/negzero eighteenth leftover", () => {
	const utils = new EnvUtils(new Logger("EnvUtilsTrueTest"), true);

	it("allMissing: boolean true + Found .env → singular, no Required, no throw", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-true-found-"));
		writeFileSync(join(root, ".env"), "X=1\n");
		const message = utils.generateEnvErrorMessage(
			root,
			"FALLBACK",
			true as unknown as string[],
		);
		expect(message).toContain("MISSING ENVIRONMENT VARIABLE\n");
		expect(message).not.toContain("VARIABLES");
		expect(message).not.toContain("Required:");
		expect(message).not.toContain("FALLBACK");
		expect(message).toContain("Found: .env");
	});

	it("allMissing: number 1 + Found .env same undefined-length residual", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-one-found-"));
		writeFileSync(join(root, ".env"), "X=1\n");
		const message = utils.generateEnvErrorMessage(
			root,
			"FALLBACK",
			1 as unknown as string[],
		);
		expect(message).not.toContain("Required:");
		expect(message).not.toContain("FALLBACK");
		expect(message).toContain("Found: .env");
	});

	it("allMissing: boolean true + no env files → Create path for-of throws", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-true-create-"));
		expect(() =>
			utils.generateEnvErrorMessage(
				root,
				"FALLBACK",
				true as unknown as string[],
			),
		).toThrow(/not iterable/);
	});

	it('allMissing: string "true" wins || then throws on .join', () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-str-true-all-"));
		writeFileSync(join(root, ".env"), "X=1\n");
		expect(() =>
			utils.generateEnvErrorMessage(
				root,
				"FALLBACK",
				"true" as unknown as string[],
			),
		).toThrow(/join is not a function/);
	});

	it("allMissing: -0 falls through to varName via || (SameValueZero)", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-negzero-all-"));
		const message = utils.generateEnvErrorMessage(
			root,
			"FALLBACK",
			-0 as unknown as string[],
		);
		expect(message).toContain("Required: FALLBACK");
		expect(message).toContain("MISSING ENVIRONMENT VARIABLE\n");
		expect(message).not.toContain("VARIABLES");
	});

	it("allMissing: empty array still wins || with no Required (control)", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-empty-arr-all-"));
		writeFileSync(join(root, ".env"), "X=1\n");
		const message = utils.generateEnvErrorMessage(root, "FALLBACK", []);
		expect(message).not.toContain("Required:");
		expect(message).not.toContain("FALLBACK");
	});
});
