import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadEnvironmentVariables } from "../../../../http/providers/agent-loader/env";

/**
 * Twentieth leftover (logger/env residual): standalone env.ts quoted `"false"` / `"true"` strip;
 * TAB-only skip; unquoted false assign — mirrors EnvUtils twentieth after
 * seventeenth trailing-junk / quoted-empty.
 */
describe("standalone env.ts quoted-false / tab / unquoted-false twentieth leftover", () => {
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

	it.each([
		{
			label: '"false"',
			line: 'S_FALSE="false"\n',
			key: "S_FALSE",
			expect: "false",
		},
		{ label: '"true"', line: 'S_TRUE="true"\n', key: "S_TRUE", expect: "true" },
	] as const)("standalone KEY=$label strips quotes", ({
		line,
		key,
		expect: expected,
	}) => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-envts-qbool-"));
		const agentFile = agentUnder(root);
		writeFileSync(join(root, ".env"), line);
		delete process.env[key];

		loadEnvironmentVariables(agentFile);

		expect(process.env[key]).toBe(expected);
	});

	it("standalone TAB-only line skipped; later key loads", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-envts-tab-"));
		const agentFile = agentUnder(root);
		writeFileSync(join(root, ".env"), "\t\nS_AFTER=1\n");
		delete process.env.S_AFTER;

		loadEnvironmentVariables(agentFile);

		expect(process.env.S_AFTER).toBe("1");
	});

	it("standalone unquoted false assigns string false", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-envts-unq-"));
		const agentFile = agentUnder(root);
		writeFileSync(join(root, ".env"), "S_UNQ=false\n");
		delete process.env.S_UNQ;

		loadEnvironmentVariables(agentFile);

		expect(process.env.S_UNQ).toBe("false");
	});
});
