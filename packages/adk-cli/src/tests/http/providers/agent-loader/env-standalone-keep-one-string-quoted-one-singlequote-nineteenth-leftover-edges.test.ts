import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadEnvironmentVariables } from "../../../../http/providers/agent-loader/env";

/**
 * Nineteenth leftover (HEAVY tip-relaunch residual after #253):
 * standalone env.ts — eighteenth pinned `"true"` keep/assign + CRLF.
 * Residual: keep `"1"`; assign quoted `"1"`; single-quote refuse strip;
 * key-without-equals skip; optional logger on non-Error String(err).
 */
describe("standalone env.ts keep-one / quoted-one / single-quote nineteenth leftover", () => {
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

	it('keeps existing process.env "1" against overwrite', () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-envts-keep-one-"));
		const agentFile = agentUnder(root);
		writeFileSync(join(root, ".env"), "ONE_KEEP=from-file\n");
		process.env.ONE_KEEP = "1";

		loadEnvironmentVariables(agentFile);

		expect(process.env.ONE_KEEP).toBe("1");
	});

	it('KEY="1" strips quotes then assigns string one', () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-envts-assign-one-"));
		const agentFile = agentUnder(root);
		writeFileSync(join(root, ".env"), 'ASSIGN_ONE="1"\n');
		delete process.env.ASSIGN_ONE;

		loadEnvironmentVariables(agentFile);

		expect(process.env.ASSIGN_ONE).toBe("1");
	});

	it("single-quoted 'true' refuses double-quote strip on standalone", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-envts-sq-"));
		const agentFile = agentUnder(root);
		writeFileSync(join(root, ".env"), "SQ='true'\n");
		delete process.env.SQ;

		loadEnvironmentVariables(agentFile);

		expect(process.env.SQ).toBe("'true'");
	});

	it("key without equals is skipped on standalone", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-envts-noeq-"));
		const agentFile = agentUnder(root);
		writeFileSync(join(root, ".env"), "NOEQUALS\nHAS=yes\n");
		delete process.env.NOEQUALS;
		delete process.env.HAS;

		loadEnvironmentVariables(agentFile);

		expect(process.env.NOEQUALS).toBeUndefined();
		expect(process.env.HAS).toBe("yes");
	});

	it("optional logger.warn still fires for EISDIR residual gate", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-envts-eisdir-19h-"));
		const agentFile = agentUnder(root);
		mkdirSync(join(root, ".env"));
		const warn = vi.fn();
		loadEnvironmentVariables(agentFile, { warn } as never);
		expect(warn).toHaveBeenCalled();
		expect(String(warn.mock.calls[0][0])).toContain(
			"Warning: Could not load .env file:",
		);
	});
});
