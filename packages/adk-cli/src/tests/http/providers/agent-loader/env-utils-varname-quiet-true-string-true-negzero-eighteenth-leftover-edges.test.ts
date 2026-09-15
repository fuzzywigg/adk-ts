import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { EnvUtils } from "../../../../http/providers/agent-loader/env-utils";

/**
 * Eighteenth leftover residual deepen (complements open #253):
 * #253 pinned allMissing true/"true"/-0/[] Found/Create paths. Residual:
 * omitted allMissing with varName=true/"true"/[]/-0/Infinity; quiet=
 * "true"/[]/-0 for `!this.quiet`.
 */
describe("EnvUtils varName/quiet true/string-true/negzero eighteenth leftover", () => {
	it("varName=boolean true → Required: true (singular)", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-vn-true-"));
		const utils = new EnvUtils({ warn: vi.fn() } as never, true);
		const message = utils.generateEnvErrorMessage(root, true as any);
		expect(message).toContain("Required: true");
		expect(message).toContain("MISSING ENVIRONMENT VARIABLE\n");
		expect(message).not.toContain("VARIABLES");
	});

	it('varName="true" → Required: true', () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-vn-str-"));
		const utils = new EnvUtils({ warn: vi.fn() } as never, true);
		const message = utils.generateEnvErrorMessage(root, "true");
		expect(message).toContain("Required: true");
	});

	it("varName=[] → Required: empty (nested [] toString)", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-vn-arr-"));
		const utils = new EnvUtils({ warn: vi.fn() } as never, true);
		const message = utils.generateEnvErrorMessage(root, [] as any);
		expect(message).toMatch(/Required:\s*\n/);
		expect(message).toContain("MISSING ENVIRONMENT VARIABLE\n");
	});

	it("varName=-0 falsy → no Required (varName ? fallthrough)", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-vn-nz-"));
		const utils = new EnvUtils({ warn: vi.fn() } as never, true);
		const message = utils.generateEnvErrorMessage(root, -0 as any);
		expect(message).not.toContain("Required:");
	});

	it("varName=Infinity → Required: Infinity Create template", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-vn-inf-"));
		const utils = new EnvUtils({ warn: vi.fn() } as never, true);
		const message = utils.generateEnvErrorMessage(
			root,
			Number.POSITIVE_INFINITY as any,
		);
		expect(message).toContain("Required: Infinity");
		expect(message).toContain("Infinity=your_value_here");
	});

	it.each([
		{ label: '"true"', quiet: "true" },
		{ label: "empty array", quiet: [] },
	] as const)("quiet=$label suppresses No .env files found warn", ({
		quiet,
	}) => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-quiet-true-"));
		writeFileSync(join(root, "package.json"), "{}");
		const warn = vi.fn();
		const utils = new EnvUtils({ warn } as never, quiet as any);
		utils.loadEnvironmentVariables(join(root, "agent.ts"));
		expect(warn).not.toHaveBeenCalled();
	});

	it("quiet=-0 does not suppress missing-.env warn (falsy)", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-quiet-nz-"));
		writeFileSync(join(root, "package.json"), "{}");
		const warn = vi.fn();
		const utils = new EnvUtils({ warn } as never, -0 as any);
		utils.loadEnvironmentVariables(join(root, "agent.ts"));
		expect(warn).toHaveBeenCalled();
		expect(String(warn.mock.calls[0][0])).toContain("No .env files found");
	});
});
