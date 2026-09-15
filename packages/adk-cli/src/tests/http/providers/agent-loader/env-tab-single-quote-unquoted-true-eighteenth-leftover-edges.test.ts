import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadEnvironmentVariables } from "../../../../http/providers/agent-loader/env";
import { EnvUtils } from "../../../../http/providers/agent-loader/env-utils";

/**
 * Eighteenth leftover residual deepen (complements open #253):
 * #253 pinned keep/assign quoted `"true"`, EnvUtils key.trim, CRLF, multi-equal.
 * Residual: TAB-only skip; single-quoted `'true'` keeps quotes; unquoted true;
 * standalone key.trim twin.
 */
describe("EnvUtils/standalone tab/single-quote/unquoted-true eighteenth leftover", () => {
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

	it("EnvUtils TAB-only line skipped after trim; later key loads", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-tab-"));
		const agentFile = agentUnder(root);
		writeFileSync(join(root, ".env"), "\t\t\nAFTER_TAB=yes\n");
		delete process.env.AFTER_TAB;

		const utils = new EnvUtils({ warn: vi.fn() } as never, true);
		utils.loadEnvironmentVariables(agentFile);

		expect(process.env.AFTER_TAB).toBe("yes");
	});

	it("EnvUtils single-quoted 'true' keeps quotes (double-quote strip only)", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-sq-"));
		const agentFile = agentUnder(root);
		writeFileSync(join(root, ".env"), "SQ_TRUE='true'\n");
		delete process.env.SQ_TRUE;

		const utils = new EnvUtils({ warn: vi.fn() } as never, true);
		utils.loadEnvironmentVariables(agentFile);

		expect(process.env.SQ_TRUE).toBe("'true'");
	});

	it("EnvUtils unquoted KEY=true assigns string true (no boolean coerce)", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-unq-true-"));
		const agentFile = agentUnder(root);
		writeFileSync(join(root, ".env"), "UNQ_TRUE=true\n");
		delete process.env.UNQ_TRUE;

		const utils = new EnvUtils({ warn: vi.fn() } as never, true);
		utils.loadEnvironmentVariables(agentFile);

		expect(process.env.UNQ_TRUE).toBe("true");
	});

	it("standalone spaced key trims before process.env write", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-envts-keytrim-"));
		const agentFile = agentUnder(root);
		writeFileSync(join(root, ".env"), "  SPACED_KEY  =spaced-val\n");
		delete process.env.SPACED_KEY;
		delete process.env["  SPACED_KEY  "];

		loadEnvironmentVariables(agentFile);

		expect(process.env.SPACED_KEY).toBe("spaced-val");
		expect(process.env["  SPACED_KEY  "]).toBeUndefined();
	});

	it("standalone TAB-only skipped; single-quoted 'true' keeps quotes", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-envts-tab-sq-"));
		const agentFile = agentUnder(root);
		writeFileSync(join(root, ".env"), "\t\nSQ_TRUE='true'\nUNQ=true\n");
		delete process.env.SQ_TRUE;
		delete process.env.UNQ;

		loadEnvironmentVariables(agentFile);

		expect(process.env.SQ_TRUE).toBe("'true'");
		expect(process.env.UNQ).toBe("true");
	});
});
