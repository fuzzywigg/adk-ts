import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EnvUtils } from "../../../../http/providers/agent-loader/env-utils";

/**
 * Eighteenth leftover (HEAVY tip-relaunch residual after #227):
 * `!process.env[key]` keep/`KEY="true"` assign — leftover/`empty-overwrite`
 * pinned `"0"`/`"false"` keep; seventeenth pinned quoted empty/`"0"`.
 * Residual: keep existing `"true"`; assign quoted `"true"`; spaced key trim;
 * non-Error catch uses String(err).
 */
describe("EnvUtils keep-true / quoted-true / key-trim / non-Error eighteenth leftover", () => {
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

	it('keeps existing process.env "true" against overwrite (truthy residual)', () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-keep-true-"));
		const agentFile = agentUnder(root);
		writeFileSync(join(root, ".env"), "TRUE_KEEP=from-file\n");
		process.env.TRUE_KEEP = "true";

		const utils = new EnvUtils({ warn: vi.fn() } as never, true);
		utils.loadEnvironmentVariables(agentFile);

		expect(process.env.TRUE_KEEP).toBe("true");
	});

	it('KEY="true" strips quotes then assigns string true', () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-assign-true-"));
		const agentFile = agentUnder(root);
		writeFileSync(join(root, ".env"), 'ASSIGN_TRUE="true"\n');
		delete process.env.ASSIGN_TRUE;

		const utils = new EnvUtils({ warn: vi.fn() } as never, true);
		utils.loadEnvironmentVariables(agentFile);

		expect(process.env.ASSIGN_TRUE).toBe("true");
	});

	it("spaced key trims before process.env write (key.trim())", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-key-trim-"));
		const agentFile = agentUnder(root);
		writeFileSync(join(root, ".env"), "  SPACED_KEY  =spaced-val\n");
		delete process.env.SPACED_KEY;
		delete process.env["  SPACED_KEY  "];

		const utils = new EnvUtils({ warn: vi.fn() } as never, true);
		utils.loadEnvironmentVariables(agentFile);

		expect(process.env.SPACED_KEY).toBe("spaced-val");
		expect(process.env["  SPACED_KEY  "]).toBeUndefined();
	});

	it("non-Error throw in catch uses String(err) in warn message", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-nonerr-"));
		const agentFile = agentUnder(root);
		mkdirSync(join(root, ".env"));
		const warn = vi.fn();
		const utils = new EnvUtils({ warn } as never, true);
		utils.loadEnvironmentVariables(agentFile);

		expect(warn).toHaveBeenCalled();
		const msg = String(warn.mock.calls[0][0]);
		expect(msg).toContain("Warning: Could not load .env file:");
		expect(msg).toMatch(/EISDIR|illegal operation on a directory|directory/i);
	});

	it("multi-equal value joins valueParts (KEY=a=b=c)", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-multieq-"));
		const agentFile = agentUnder(root);
		writeFileSync(join(root, ".env"), "MULTI=a=b=c\n");
		delete process.env.MULTI;

		const utils = new EnvUtils({ warn: vi.fn() } as never, true);
		utils.loadEnvironmentVariables(agentFile);

		expect(process.env.MULTI).toBe("a=b=c");
	});
});
