import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EnvUtils } from "../../../../http/providers/agent-loader/env-utils";

/**
 * Leftover: `!process.env[key]` treats "" as missing (overwrite) but keeps "0";
 * comment lines use startsWith("#") on the whole line only.
 */
describe("EnvUtils empty-env overwrite leftover edges", () => {
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

	it("overwrites empty-string process.env from .env (falsy gate)", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-empty-"));
		const agentFile = agentUnder(root);
		writeFileSync(join(root, ".env"), "EMPTY_OVERWRITE=from-file\n");
		process.env.EMPTY_OVERWRITE = "";

		const utils = new EnvUtils({ warn: vi.fn() } as never, true);
		utils.loadEnvironmentVariables(agentFile);

		expect(process.env.EMPTY_OVERWRITE).toBe("from-file");
	});

	it("keeps existing process.env value of '0' (truthy)", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-zero-"));
		const agentFile = agentUnder(root);
		writeFileSync(join(root, ".env"), "ZERO_KEEP=from-file\n");
		process.env.ZERO_KEEP = "0";

		const utils = new EnvUtils({ warn: vi.fn() } as never, true);
		utils.loadEnvironmentVariables(agentFile);

		expect(process.env.ZERO_KEEP).toBe("0");
	});

	it.each([
		{ label: "false", existing: "false" },
		{ label: "space", existing: " " },
		{ label: "tab", existing: "\t" },
	] as const)("keeps existing process.env '$label' (truthy string) vs empty overwrite", ({
		existing,
	}) => {
		const root = mkdtempSync(
			join(tmpdir(), `adk-cli-env-keep-${existing.length}-`),
		);
		const agentFile = agentUnder(root);
		writeFileSync(join(root, ".env"), "TRUTHY_KEEP=from-file\n");
		process.env.TRUTHY_KEEP = existing;

		const utils = new EnvUtils({ warn: vi.fn() } as never, true);
		utils.loadEnvironmentVariables(agentFile);

		expect(process.env.TRUTHY_KEEP).toBe(existing);
	});

	it("assigns KEY= with empty value because valueParts.length > 0", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-blank-"));
		const agentFile = agentUnder(root);
		writeFileSync(join(root, ".env"), "BLANK_VAL=\n");
		delete process.env.BLANK_VAL;

		const utils = new EnvUtils({ warn: vi.fn() } as never, true);
		utils.loadEnvironmentVariables(agentFile);

		expect(process.env.BLANK_VAL).toBe("");
	});

	it("does not treat KEY=#hash as a comment line", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-hash-"));
		const agentFile = agentUnder(root);
		writeFileSync(join(root, ".env"), "HASH_VAL=#hash\n# skipped=1\n");
		delete process.env.HASH_VAL;
		delete process.env.skipped;

		const utils = new EnvUtils({ warn: vi.fn() } as never, true);
		utils.loadEnvironmentVariables(agentFile);

		expect(process.env.HASH_VAL).toBe("#hash");
		expect(process.env.skipped).toBeUndefined();
	});
});
