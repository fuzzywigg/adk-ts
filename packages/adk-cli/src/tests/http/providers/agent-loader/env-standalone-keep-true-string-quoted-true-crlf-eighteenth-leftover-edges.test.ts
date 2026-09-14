import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadEnvironmentVariables } from "../../../../http/providers/agent-loader/env";

/**
 * Eighteenth leftover (HEAVY tip-relaunch residual after #227):
 * standalone env.ts — seventeenth trailing-junk / quoted empty / `"0"`;
 * sixteenth leading junk / production. Residual: keep `"true"`; assign
 * quoted `"true"`; CRLF parity with EnvUtils seventeenth; multi-equal join.
 */
describe("standalone env.ts keep-true / quoted-true / CRLF eighteenth leftover", () => {
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

	it('keeps existing process.env "true" against overwrite', () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-envts-keep-true-"));
		const agentFile = agentUnder(root);
		writeFileSync(join(root, ".env"), "TRUE_KEEP=from-file\n");
		process.env.TRUE_KEEP = "true";

		loadEnvironmentVariables(agentFile);

		expect(process.env.TRUE_KEEP).toBe("true");
	});

	it('KEY="true" strips quotes then assigns string true', () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-envts-assign-true-"));
		const agentFile = agentUnder(root);
		writeFileSync(join(root, ".env"), 'ASSIGN_TRUE="true"\n');
		delete process.env.ASSIGN_TRUE;

		loadEnvironmentVariables(agentFile);

		expect(process.env.ASSIGN_TRUE).toBe("true");
	});

	it("CRLF line endings still load keys after trim (EnvUtils seventeenth twin)", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-envts-crlf-"));
		const agentFile = agentUnder(root);
		writeFileSync(join(root, ".env"), "CRLF_A=a\r\nCRLF_B=b\r\n");
		delete process.env.CRLF_A;
		delete process.env.CRLF_B;

		loadEnvironmentVariables(agentFile);

		expect(process.env.CRLF_A).toBe("a");
		expect(process.env.CRLF_B).toBe("b");
	});

	it("multi-equal value joins valueParts on standalone", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-envts-multieq-"));
		const agentFile = agentUnder(root);
		writeFileSync(join(root, ".env"), "MULTI=a=b=c\n");
		delete process.env.MULTI;

		loadEnvironmentVariables(agentFile);

		expect(process.env.MULTI).toBe("a=b=c");
	});

	it("optional logger.warn on EISDIR still fires for residual gate", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-envts-eisdir-"));
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
