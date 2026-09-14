import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadEnvironmentVariables } from "../../../../http/providers/agent-loader/env";

/**
 * Leftover: standalone `env.ts` `loadEnvironmentVariables` is unused by the
 * Nest loader (EnvUtils path) but still shipped. Cover empty-string overwrite,
 * optional logger catch warn, and no "missing .env" warn (unlike EnvUtils).
 */
describe("standalone env.ts loadEnvironmentVariables leftover edges", () => {
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

	it("overwrites empty-string process.env from .env (same falsy gate as EnvUtils)", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-envts-empty-"));
		const agentFile = agentUnder(root);
		writeFileSync(join(root, ".env"), "STANDALONE_EMPTY=from-file\n");
		process.env.STANDALONE_EMPTY = "";

		loadEnvironmentVariables(agentFile);

		expect(process.env.STANDALONE_EMPTY).toBe("from-file");
	});

	it("keeps existing process.env '0' (truthy)", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-envts-zero-"));
		const agentFile = agentUnder(root);
		writeFileSync(join(root, ".env"), "STANDALONE_ZERO=from-file\n");
		process.env.STANDALONE_ZERO = "0";

		loadEnvironmentVariables(agentFile);

		expect(process.env.STANDALONE_ZERO).toBe("0");
	});

	it("does not warn when no env files exist (no loadedAny/quiet path)", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-envts-none-"));
		const agentFile = agentUnder(root);
		const warn = vi.fn();
		loadEnvironmentVariables(agentFile, { warn } as never);
		expect(warn).not.toHaveBeenCalled();
	});

	it("optional logger.warn on EISDIR when .env is a directory", () => {
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

	it("tolerates missing logger on EISDIR (optional chaining)", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-envts-nolog-"));
		const agentFile = agentUnder(root);
		mkdirSync(join(root, ".env"));
		expect(() => loadEnvironmentVariables(agentFile)).not.toThrow();
	});

	it("strips double quotes and preserves KEY=#hash (not a comment)", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-envts-quote-"));
		const agentFile = agentUnder(root);
		writeFileSync(
			join(root, ".env"),
			'Q="quoted"\nHASH_VAL=#hash\n# skipped=1\n',
		);
		delete process.env.Q;
		delete process.env.HASH_VAL;
		delete process.env.skipped;

		loadEnvironmentVariables(agentFile);

		expect(process.env.Q).toBe("quoted");
		expect(process.env.HASH_VAL).toBe("#hash");
		expect(process.env.skipped).toBeUndefined();
	});

	it(".env.local wins over later .env (!process.env gate, same list as EnvUtils)", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-envts-prec-"));
		const agentFile = agentUnder(root);
		writeFileSync(join(root, ".env.local"), "STANDALONE_SAME=from-local\n");
		writeFileSync(join(root, ".env"), "STANDALONE_SAME=from-dotenv\n");
		delete process.env.STANDALONE_SAME;

		loadEnvironmentVariables(agentFile);

		expect(process.env.STANDALONE_SAME).toBe("from-local");
	});

	it("does not strip single quotes; value.trim() still applies", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-envts-sq-"));
		const agentFile = agentUnder(root);
		writeFileSync(join(root, ".env"), "SINGLE_Q='kept'\nPADDED=  trim-me  \n");
		delete process.env.SINGLE_Q;
		delete process.env.PADDED;

		loadEnvironmentVariables(agentFile);

		expect(process.env.SINGLE_Q).toBe("'kept'");
		expect(process.env.PADDED).toBe("trim-me");
	});

	it("keeps existing process.env 'false' (truthy string) against overwrite", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-envts-false-"));
		const agentFile = agentUnder(root);
		writeFileSync(join(root, ".env"), "STANDALONE_FALSE=from-file\n");
		process.env.STANDALONE_FALSE = "false";

		loadEnvironmentVariables(agentFile);

		expect(process.env.STANDALONE_FALSE).toBe("false");
	});
});
