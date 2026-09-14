import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EnvUtils } from "../../../../http/providers/agent-loader/env-utils";

/**
 * Nineteenth leftover (HEAVY tip-relaunch residual after #253):
 * `!process.env[key]` keep / quote strip — eighteenth pinned `"true"` keep/
 * assign. Residual: keep existing `"1"`; assign quoted `"1"`; single-quoted
 * `'true'` refuses `/^"(.*)"$/` strip (quotes retained).
 */
describe("EnvUtils keep-one / quoted-one / single-quote nineteenth leftover", () => {
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

	it('keeps existing process.env "1" against overwrite (truthy residual)', () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-keep-one-"));
		const agentFile = agentUnder(root);
		writeFileSync(join(root, ".env"), "ONE_KEEP=from-file\n");
		process.env.ONE_KEEP = "1";

		const utils = new EnvUtils({ warn: vi.fn() } as never, true);
		utils.loadEnvironmentVariables(agentFile);

		expect(process.env.ONE_KEEP).toBe("1");
	});

	it('KEY="1" strips quotes then assigns string one', () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-assign-one-"));
		const agentFile = agentUnder(root);
		writeFileSync(join(root, ".env"), 'ASSIGN_ONE="1"\n');
		delete process.env.ASSIGN_ONE;

		const utils = new EnvUtils({ warn: vi.fn() } as never, true);
		utils.loadEnvironmentVariables(agentFile);

		expect(process.env.ASSIGN_ONE).toBe("1");
	});

	it("single-quoted 'true' refuses double-quote strip (quotes retained)", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-sq-"));
		const agentFile = agentUnder(root);
		writeFileSync(join(root, ".env"), "SQ='true'\n");
		delete process.env.SQ;

		const utils = new EnvUtils({ warn: vi.fn() } as never, true);
		utils.loadEnvironmentVariables(agentFile);

		expect(process.env.SQ).toBe("'true'");
	});

	it("hash-only line skipped; following KEY still loads (midlist twin)", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-hash-mid-"));
		const agentFile = agentUnder(root);
		writeFileSync(join(root, ".env"), "# only comment\nAFTER_HASH=ok\n");
		delete process.env.AFTER_HASH;

		const utils = new EnvUtils({ warn: vi.fn() } as never, true);
		utils.loadEnvironmentVariables(agentFile);

		expect(process.env.AFTER_HASH).toBe("ok");
	});

	it("key without equals is skipped (valueParts.length === 0)", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-noeq-"));
		const agentFile = agentUnder(root);
		writeFileSync(join(root, ".env"), "NOEQUALS\nHAS=yes\n");
		delete process.env.NOEQUALS;
		delete process.env.HAS;

		const utils = new EnvUtils({ warn: vi.fn() } as never, true);
		utils.loadEnvironmentVariables(agentFile);

		expect(process.env.NOEQUALS).toBeUndefined();
		expect(process.env.HAS).toBe("yes");
	});
});
