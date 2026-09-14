import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EnvUtils } from "../../../../http/providers/agent-loader/env-utils";

/**
 * Seventeenth leftover: EISDIR-only + quiet=true suppresses second missing
 * warn (sixteenth dual-warn is quiet=false). Inline `#` is not a comment
 * (`startsWith("#")` is whole-line only). CRLF lines still parse after trim.
 */
describe("EnvUtils EISDIR quiet / inline hash / CRLF seventeenth leftover", () => {
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

	it("EISDIR-only .env with quiet=true → single Could not load warn (no missing)", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-eisdir-quiet-"));
		const agentFile = agentUnder(root);
		mkdirSync(join(root, ".env"));
		const warn = vi.fn();
		const utils = new EnvUtils({ warn } as never, true);
		utils.loadEnvironmentVariables(agentFile);

		expect(warn).toHaveBeenCalledTimes(1);
		expect(String(warn.mock.calls[0][0])).toContain(
			"Warning: Could not load .env file:",
		);
		expect(String(warn.mock.calls[0][0])).not.toContain("No .env files found");
	});

	it("inline # after value is kept (startsWith('#') is whole-line only)", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-inline-hash-"));
		const agentFile = agentUnder(root);
		writeFileSync(join(root, ".env"), "INLINE=val#not-a-comment\n");
		delete process.env.INLINE;

		const utils = new EnvUtils({ warn: vi.fn() } as never, true);
		utils.loadEnvironmentVariables(agentFile);

		expect(process.env.INLINE).toBe("val#not-a-comment");
	});

	it("CRLF line endings still load keys after trim", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-crlf-"));
		const agentFile = agentUnder(root);
		writeFileSync(join(root, ".env"), "CRLF_A=a\r\nCRLF_B=b\r\n");
		delete process.env.CRLF_A;
		delete process.env.CRLF_B;

		const utils = new EnvUtils({ warn: vi.fn() } as never, true);
		utils.loadEnvironmentVariables(agentFile);

		expect(process.env.CRLF_A).toBe("a");
		expect(process.env.CRLF_B).toBe("b");
	});

	it('KEY="" assigns empty string (truthy gate on key/valueParts only)', () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-empty-assign-"));
		const agentFile = agentUnder(root);
		writeFileSync(join(root, ".env"), 'EMPTY_Q=""\n');
		delete process.env.EMPTY_Q;

		const utils = new EnvUtils({ warn: vi.fn() } as never, true);
		utils.loadEnvironmentVariables(agentFile);

		expect(process.env.EMPTY_Q).toBe("");
	});

	it("whole-line # comment is skipped while later KEY loads", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-hash-line-"));
		const agentFile = agentUnder(root);
		writeFileSync(
			join(root, ".env"),
			"# FULL_COMMENT=ignored\nAFTER_COMMENT=yes\n",
		);
		delete process.env.FULL_COMMENT;
		delete process.env.AFTER_COMMENT;

		const utils = new EnvUtils({ warn: vi.fn() } as never, true);
		utils.loadEnvironmentVariables(agentFile);

		expect(process.env.FULL_COMMENT).toBeUndefined();
		expect(process.env.AFTER_COMMENT).toBe("yes");
	});
});
