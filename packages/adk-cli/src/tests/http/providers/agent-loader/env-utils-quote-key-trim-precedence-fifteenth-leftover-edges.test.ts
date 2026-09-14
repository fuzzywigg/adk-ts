import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EnvUtils } from "../../../../http/providers/agent-loader/env-utils";

/**
 * Fifteenth leftover: quote regex near-miss with trailing junk; whitespace-only
 * key after trim skipped; `.env.production.local` / `.env.development.local`
 * mid-list precedence; comment-only file still sets loadedAny → suppresses warn.
 */
describe("EnvUtils quote/key-trim/precedence/loadedAny fifteenth leftover", () => {
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

	it('trailing junk after closing " refuses strip via /^"(.*)"$/', () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-trail-q-"));
		const agentFile = agentUnder(root);
		writeFileSync(join(root, ".env"), 'KEY="val"suffix\n');
		delete process.env.KEY;

		const utils = new EnvUtils({ warn: vi.fn() } as never, true);
		utils.loadEnvironmentVariables(agentFile);

		expect(process.env.KEY).toBe('"val"suffix');
	});

	it("whitespace-only key after trim is skipped (no env[''] assign)", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-ws-key-"));
		const agentFile = agentUnder(root);
		writeFileSync(join(root, ".env"), "   =novalue\n  \t=x\nKEEP=1\n");
		delete process.env.KEEP;
		const beforeEmpty = process.env[""];

		const utils = new EnvUtils({ warn: vi.fn() } as never, true);
		utils.loadEnvironmentVariables(agentFile);

		expect(process.env.KEEP).toBe("1");
		expect(process.env[""]).toBe(beforeEmpty);
	});

	it(".env.production.local wins over later .env for same key", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-prod-local-"));
		const agentFile = agentUnder(root);
		writeFileSync(join(root, ".env.production.local"), "MID=from-prod-local\n");
		writeFileSync(join(root, ".env"), "MID=from-dotenv\n");
		delete process.env.MID;

		const utils = new EnvUtils({ warn: vi.fn() } as never, true);
		utils.loadEnvironmentVariables(agentFile);

		expect(process.env.MID).toBe("from-prod-local");
	});

	it(".env.development.local wins over later .env for same key", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-dev-local-"));
		const agentFile = agentUnder(root);
		writeFileSync(join(root, ".env.development.local"), "MID=from-dev-local\n");
		writeFileSync(join(root, ".env"), "MID=from-dotenv\n");
		delete process.env.MID;

		const utils = new EnvUtils({ warn: vi.fn() } as never, true);
		utils.loadEnvironmentVariables(agentFile);

		expect(process.env.MID).toBe("from-dev-local");
	});

	it("comment-only .env still sets loadedAny → suppresses missing warn", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-comment-only-"));
		const agentFile = agentUnder(root);
		writeFileSync(join(root, ".env"), "# only a comment\n\n   \n");
		const warn = vi.fn();
		const utils = new EnvUtils({ warn } as never, false);
		utils.loadEnvironmentVariables(agentFile);
		expect(warn).not.toHaveBeenCalled();
	});
});
