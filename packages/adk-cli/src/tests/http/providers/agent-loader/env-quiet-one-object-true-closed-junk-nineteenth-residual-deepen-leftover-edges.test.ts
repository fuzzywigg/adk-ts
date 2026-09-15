import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadEnvironmentVariables } from "../../../../http/providers/agent-loader/env";
import { EnvUtils } from "../../../../http/providers/agent-loader/env-utils";

/**
 * Nineteenth leftover residual deepen after tip #289 / f93c037:
 * tip pinned quiet=NaN (warn) / quiet=-Infinity (suppress) + unclosed
 * `"true` + empty `KEY=`. Residual: quiet=1/{}/Object(true) suppress;
 * closed `"true"junk` keeps quotes (full-string regex miss); EnvUtils +
 * standalone twin.
 */
describe("EnvUtils/standalone quiet-1/object/closed-junk nineteenth residual deepen", () => {
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
		{ label: "number 1", quiet: 1 },
		{ label: "empty object", quiet: {} },
		{ label: "Object(true)", quiet: Object(true) },
	] as const)("quiet=$label suppresses No .env files found warn", ({
		quiet,
	}) => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-quiet-res-"));
		writeFileSync(join(root, "package.json"), "{}");
		const warn = vi.fn();
		const utils = new EnvUtils({ warn } as never, quiet as any);
		utils.loadEnvironmentVariables(join(root, "agent.ts"));
		expect(warn).not.toHaveBeenCalled();
	});

	it('EnvUtils KEY="true"junk keeps outer quotes (strip regex full-match miss)', () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-closed-junk-"));
		const agentFile = agentUnder(root);
		writeFileSync(join(root, ".env"), 'JUNK="true"extra\n');
		delete process.env.JUNK;

		const utils = new EnvUtils({ warn: vi.fn() } as never, true);
		utils.loadEnvironmentVariables(agentFile);

		expect(process.env.JUNK).toBe('"true"extra');
	});

	it('EnvUtils closed KEY="true" control still strips (tip twin)', () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-closed-ctrl-"));
		const agentFile = agentUnder(root);
		writeFileSync(join(root, ".env"), 'CLOSED="true"\n');
		delete process.env.CLOSED;

		const utils = new EnvUtils({ warn: vi.fn() } as never, true);
		utils.loadEnvironmentVariables(agentFile);

		expect(process.env.CLOSED).toBe("true");
	});

	it("standalone quiet-object suppress + closed-junk twin EnvUtils", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-envts-quiet-res-"));
		const agentFile = agentUnder(root);
		writeFileSync(join(root, ".env"), 'JUNK="true"extra\nCLOSED="true"\n');
		delete process.env.JUNK;
		delete process.env.CLOSED;

		loadEnvironmentVariables(agentFile);

		expect(process.env.JUNK).toBe('"true"extra');
		expect(process.env.CLOSED).toBe("true");
	});
});
