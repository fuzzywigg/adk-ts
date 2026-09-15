import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { EnvUtils } from "../../../../http/providers/agent-loader/env-utils";

/**
 * Nineteenth leftover residual after tip #261 / #253:
 * #253 pinned allMissing true/1/"true"/-0/[]; #261 pinned varName + quiet
 * "true"/[]/-0. Residual: allMissing ±Infinity Found (undefined.length →
 * singular, no Required) vs Create `for…of` throw; quiet=Infinity suppresses.
 */
describe("EnvUtils allMissing infinity/neginf / quiet Infinity nineteenth leftover", () => {
	it.each([
		{ label: "Infinity", allMissing: Number.POSITIVE_INFINITY },
		{ label: "-Infinity", allMissing: Number.NEGATIVE_INFINITY },
	] as const)("allMissing=$label + Found .env → singular, no Required", ({
		allMissing,
	}) => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-inf-found-"));
		writeFileSync(join(root, ".env"), "X=1\n");
		const utils = new EnvUtils({ warn: vi.fn() } as never, true);
		const message = utils.generateEnvErrorMessage(
			root,
			"FALLBACK",
			allMissing as unknown as string[],
		);
		expect(message).toContain("MISSING ENVIRONMENT VARIABLE\n");
		expect(message).not.toContain("VARIABLES");
		expect(message).not.toContain("Required:");
		expect(message).not.toContain("FALLBACK");
		expect(message).toContain("Found: .env");
	});

	it.each([
		{ label: "Infinity", allMissing: Number.POSITIVE_INFINITY },
		{ label: "-Infinity", allMissing: Number.NEGATIVE_INFINITY },
	] as const)("allMissing=$label + no env files → Create for-of throws", ({
		allMissing,
	}) => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-inf-create-"));
		const utils = new EnvUtils({ warn: vi.fn() } as never, true);
		expect(() =>
			utils.generateEnvErrorMessage(
				root,
				"FALLBACK",
				allMissing as unknown as string[],
			),
		).toThrow(/not iterable/);
	});

	it("allMissing=NaN falls through to varName via || (falsy like -0)", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-nan-all-"));
		const utils = new EnvUtils({ warn: vi.fn() } as never, true);
		const message = utils.generateEnvErrorMessage(
			root,
			"FALLBACK",
			Number.NaN as unknown as string[],
		);
		expect(message).toContain("Required: FALLBACK");
		expect(message).toContain("MISSING ENVIRONMENT VARIABLE\n");
		expect(message).not.toContain("VARIABLES");
	});

	it("quiet=Infinity suppresses No .env files found warn (truthy residual)", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-quiet-inf-"));
		writeFileSync(join(root, "package.json"), "{}");
		const warn = vi.fn();
		const utils = new EnvUtils(
			{ warn } as never,
			Number.POSITIVE_INFINITY as any,
		);
		utils.loadEnvironmentVariables(join(root, "agent.ts"));
		expect(warn).not.toHaveBeenCalled();
	});

	it("varName=-Infinity → Required: -Infinity Create template", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-vn-neginf-"));
		const utils = new EnvUtils({ warn: vi.fn() } as never, true);
		const message = utils.generateEnvErrorMessage(
			root,
			Number.NEGATIVE_INFINITY as any,
		);
		expect(message).toContain("Required: -Infinity");
		expect(message).toContain("-Infinity=your_value_here");
	});
});
