import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadEnvironmentVariables } from "../../../../http/providers/agent-loader/env";

/**
 * Seventeenth leftover: standalone env.ts trailing junk after closing `"`
 * refuses strip (EnvUtils fifteenth; standalone sixteenth only leading junk).
 * Quoted empty / `"0"` strip+keep asymmetry.
 */
describe("standalone env.ts trailing-junk / quoted empty seventeenth leftover", () => {
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
		const root = mkdtempSync(join(tmpdir(), "adk-cli-envts-trail-q-"));
		const agentFile = agentUnder(root);
		writeFileSync(join(root, ".env"), 'KEY="val"suffix\n');
		delete process.env.KEY;

		loadEnvironmentVariables(agentFile);

		expect(process.env.KEY).toBe('"val"suffix');
	});

	it('KEY="" strips quotes then assigns empty string', () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-envts-empty-q-"));
		const agentFile = agentUnder(root);
		writeFileSync(join(root, ".env"), 'EMPTY=""\n');
		delete process.env.EMPTY;

		loadEnvironmentVariables(agentFile);

		expect(process.env.EMPTY).toBe("");
	});

	it('KEY="0" keeps string zero after strip (truthy env value)', () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-envts-zero-q-"));
		const agentFile = agentUnder(root);
		writeFileSync(join(root, ".env"), 'ZERO="0"\n');
		delete process.env.ZERO;

		loadEnvironmentVariables(agentFile);

		expect(process.env.ZERO).toBe("0");
	});

	it("inline # after value kept on standalone (whole-line comment only)", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-envts-inline-hash-"));
		const agentFile = agentUnder(root);
		writeFileSync(join(root, ".env"), "INLINE=val#not-a-comment\n");
		delete process.env.INLINE;

		loadEnvironmentVariables(agentFile);

		expect(process.env.INLINE).toBe("val#not-a-comment");
	});
});
