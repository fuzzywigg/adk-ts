import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EnvUtils } from "../../../../http/providers/agent-loader/env-utils";

/**
 * Twenty-first leftover residual deepen after tip #292 / 5156762:
 * nineteenth pinned quiet NaN/−Infinity and allMissing ±Infinity/NaN.
 * Residual: quiet=`"Infinity"` / `Object(1)` / `Object(false)` suppress
 * (truthy); allMissing=`"Infinity"` hits `.join` throw (string.length>0);
 * allMissing=`Object(1)`/`Object(false)` singular no-Required Found +
 * Create for-of throw; varName boxed/string Infinity templates.
 */
describe("EnvUtils quiet/allMissing string-infinity/object-one/object-false twenty-first residual deepen", () => {
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

	it.each([
		{ label: '"Infinity"', quiet: "Infinity" },
		{ label: "Object(1)", quiet: Object(1) },
		{ label: "Object(false)", quiet: Object(false) },
	] as const)("quiet=$label suppresses No .env files found warn", ({
		quiet,
	}) => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-quiet-21-"));
		writeFileSync(join(root, "package.json"), "{}");
		const warn = vi.fn();
		const utils = new EnvUtils({ warn } as never, quiet as any);
		utils.loadEnvironmentVariables(join(root, "agent.ts"));
		expect(warn).not.toHaveBeenCalled();
	});

	it('allMissing="Infinity" Found path throws (string.length>0 but no .join)', () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-am-strinf-"));
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

	it('allMissing="Infinity" Create path also throws on .join before for-of', () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-am-strinf-create-"));
		const utils = new EnvUtils({ warn: vi.fn() } as never, true);
		expect(() =>
			utils.generateEnvErrorMessage(
				root,
				"FALLBACK",
				"Infinity" as unknown as string[],
			),
		).toThrow(/join is not a function/);
	});

	it.each([
		{ label: "Object(1)", allMissing: Object(1) },
		{ label: "Object(false)", allMissing: Object(false) },
	] as const)("allMissing=$label + Found .env → singular, no Required", ({
		allMissing,
	}) => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-am-obj-found-"));
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
		{ label: "Object(1)", allMissing: Object(1) },
		{ label: "Object(false)", allMissing: Object(false) },
	] as const)("allMissing=$label + no env files → Create for-of throws", ({
		allMissing,
	}) => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-am-obj-create-"));
		const utils = new EnvUtils({ warn: vi.fn() } as never, true);
		expect(() =>
			utils.generateEnvErrorMessage(
				root,
				"FALLBACK",
				allMissing as unknown as string[],
			),
		).toThrow(/not iterable/);
	});

	it.each([
		{
			label: '"Infinity"',
			varName: "Infinity",
			required: "Required: Infinity",
			template: "Infinity=your_value_here",
		},
		{
			label: "Object(1)",
			varName: Object(1),
			required: "Required: 1",
			template: "1=your_value_here",
		},
		{
			label: "Object(false)",
			varName: Object(false),
			required: "Required: false",
			template: "false=your_value_here",
		},
	] as const)("varName=$label → Required + Create template", ({
		varName,
		required,
		template,
	}) => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-vn-21-"));
		const utils = new EnvUtils({ warn: vi.fn() } as never, true);
		const message = utils.generateEnvErrorMessage(root, varName as any);
		expect(message).toContain(required);
		expect(message).toContain(template);
	});

	it('standalone-style KEY="Infinity" + KEY=false assign via EnvUtils', () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-assign-21-"));
		writeFileSync(join(root, "package.json"), "{}");
		const agentsDir = join(root, "agents");
		mkdirSync(agentsDir, { recursive: true });
		const agentFile = join(agentsDir, "agent.ts");
		writeFileSync(agentFile, "export {}");
		writeFileSync(
			join(root, ".env"),
			'STRINF="Infinity"\nOBJISH=false\nONE=1\n',
		);
		delete process.env.STRINF;
		delete process.env.OBJISH;
		delete process.env.ONE;

		const utils = new EnvUtils({ warn: vi.fn() } as never, true);
		utils.loadEnvironmentVariables(agentFile);

		expect(process.env.STRINF).toBe("Infinity");
		expect(process.env.OBJISH).toBe("false");
		expect(process.env.ONE).toBe("1");
	});
});
