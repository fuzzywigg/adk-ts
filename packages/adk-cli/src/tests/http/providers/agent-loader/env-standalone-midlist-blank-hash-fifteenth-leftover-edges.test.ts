import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadEnvironmentVariables } from "../../../../http/providers/agent-loader/env";

/**
 * Fifteenth leftover: standalone env.ts mid-list precedence, blank assign,
 * post-trim `#` comment, and truthy `" "` keep vs empty-string overwrite.
 */
describe("standalone env.ts midlist/blank/hash fifteenth leftover", () => {
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

	it(".env.development wins over later .env (mid-list priority)", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-envts-dev-"));
		const agentFile = agentUnder(root);
		writeFileSync(join(root, ".env.development"), "STANDALONE_MID=from-dev\n");
		writeFileSync(join(root, ".env"), "STANDALONE_MID=from-dotenv\n");
		delete process.env.STANDALONE_MID;

		loadEnvironmentVariables(agentFile);

		expect(process.env.STANDALONE_MID).toBe("from-dev");
	});

	it("KEY= blank assign sets empty string; post-trim # is comment", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-envts-blank-"));
		const agentFile = agentUnder(root);
		writeFileSync(join(root, ".env"), "BLANK=\n  # SKIP=1\nKEEP=1\n");
		delete process.env.BLANK;
		delete process.env.SKIP;
		delete process.env.KEEP;

		loadEnvironmentVariables(agentFile);

		expect(process.env.BLANK).toBe("");
		expect(process.env.SKIP).toBeUndefined();
		expect(process.env.KEEP).toBe("1");
	});

	it("keeps existing process.env ' ' (truthy space) against overwrite", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-envts-space-"));
		const agentFile = agentUnder(root);
		writeFileSync(join(root, ".env"), "STANDALONE_SPACE=from-file\n");
		process.env.STANDALONE_SPACE = " ";

		loadEnvironmentVariables(agentFile);

		expect(process.env.STANDALONE_SPACE).toBe(" ");
	});

	it("overwrites empty-string process.env while space keep holds (control pair)", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-envts-empty-ctrl-"));
		const agentFile = agentUnder(root);
		writeFileSync(
			join(root, ".env"),
			"STANDALONE_EMPTY2=from-file\nSTANDALONE_SPACE2=from-file\n",
		);
		process.env.STANDALONE_EMPTY2 = "";
		process.env.STANDALONE_SPACE2 = " ";

		loadEnvironmentVariables(agentFile);

		expect(process.env.STANDALONE_EMPTY2).toBe("from-file");
		expect(process.env.STANDALONE_SPACE2).toBe(" ");
	});
});
