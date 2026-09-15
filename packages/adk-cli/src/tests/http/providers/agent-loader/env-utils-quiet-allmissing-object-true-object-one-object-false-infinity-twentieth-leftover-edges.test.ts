import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadEnvironmentVariables } from "../../../../http/providers/agent-loader/env";
import { EnvUtils } from "../../../../http/providers/agent-loader/env-utils";

/**
 * Twentieth leftover residual deepen after tip #289 / #292:
 * nineteenth pinned quiet NaN/-Infinity + allMissing ±Infinity.
 * Residual: quiet=`Object(true)`/`Object(1)`/`Object(false)` suppress
 * (boxed false truthy); allMissing boxed → Found singular + Create throw;
 * allMissing=`"Infinity"` → `.join` throw (length 8 twin of tip `"true"`).
 */
describe("EnvUtils quiet/allMissing object-true/one/false/infinity twentieth leftover", () => {
	const originalEnv = { ...process.env };

	afterEach(() => {
		for (const key of Object.keys(process.env)) {
			if (!(key in originalEnv)) {
				delete process.env[key];
			}
		}
		for (const [key, value] of Object.entries(originalEnv)) {
			process.env[key] = value;
		}
	});

	function agentUnder(root: string): string {
		writeFileSync(join(root, "package.json"), "{}");
		const agentsDir = join(root, "agents");
		mkdirSync(agentsDir, { recursive: true });
		const agentFile = join(agentsDir, "agent.ts");
		writeFileSync(agentFile, "export {}");
		return agentFile;
	}

	it.each([
		{ label: "Object(true)", quiet: Object(true) },
		{ label: "Object(1)", quiet: Object(1) },
		{ label: "Object(false)", quiet: Object(false) },
	])("quiet=$label suppresses No .env files found warn", ({ quiet }) => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-quiet-boxed-"));
		writeFileSync(join(root, "package.json"), "{}");
		const warn = vi.fn();
		const utils = new EnvUtils({ warn } as never, quiet as any);
		utils.loadEnvironmentVariables(join(root, "agent.ts"));
		expect(warn).not.toHaveBeenCalled();
	});

	it("quiet=false control still warns (primitive twin)", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-quiet-prim-"));
		writeFileSync(join(root, "package.json"), "{}");
		const warn = vi.fn();
		const utils = new EnvUtils({ warn } as never, false);
		utils.loadEnvironmentVariables(join(root, "agent.ts"));
		expect(warn).toHaveBeenCalled();
		expect(String(warn.mock.calls[0][0])).toContain("No .env files found");
	});

	it.each([
		{ label: "Object(true)", allMissing: Object(true) },
		{ label: "Object(1)", allMissing: Object(1) },
		{ label: "Object(false)", allMissing: Object(false) },
	])("allMissing=$label + Found .env → singular, no Required", ({
		allMissing,
	}) => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-boxed-found-"));
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
		{ label: "Object(true)", allMissing: Object(true) },
		{ label: "Object(1)", allMissing: Object(1) },
		{ label: "Object(false)", allMissing: Object(false) },
	])("allMissing=$label + no env files → Create for-of throws", ({
		allMissing,
	}) => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-boxed-create-"));
		const utils = new EnvUtils({ warn: vi.fn() } as never, true);
		expect(() =>
			utils.generateEnvErrorMessage(
				root,
				"FALLBACK",
				allMissing as unknown as string[],
			),
		).toThrow(/not iterable/);
	});

	it('allMissing="Infinity" wins || then throws on .join (length>0 twin of "true")', () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-infstr-join-"));
		writeFileSync(join(root, ".env"), "X=1\n");
		const utils = new EnvUtils({ warn: vi.fn() } as never, true);
		expect(() =>
			utils.generateEnvErrorMessage(
				root,
				"FALLBACK",
				"Infinity" as unknown as string[],
			),
		).toThrow(/join is not a function/);
	});

	it('allMissing="Infinity" + no env files still throws on .join before Create', () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-infstr-create-"));
		const utils = new EnvUtils({ warn: vi.fn() } as never, true);
		expect(() =>
			utils.generateEnvErrorMessage(
				root,
				"FALLBACK",
				"Infinity" as unknown as string[],
			),
		).toThrow(/join is not a function/);
	});

	it('varName="Infinity" → Required: Infinity Create template', () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-vn-infstr-"));
		const utils = new EnvUtils({ warn: vi.fn() } as never, true);
		const message = utils.generateEnvErrorMessage(root, "Infinity");
		expect(message).toContain("Required: Infinity");
		expect(message).toContain("Infinity=your_value_here");
	});

	it("standalone KEY=Infinity assigns literal (no Number coercion)", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-envts-inf-"));
		const agentFile = agentUnder(root);
		writeFileSync(join(root, ".env"), "INFVAL=Infinity\n");
		delete process.env.INFVAL;

		loadEnvironmentVariables(agentFile);

		expect(process.env.INFVAL).toBe("Infinity");
	});
});
