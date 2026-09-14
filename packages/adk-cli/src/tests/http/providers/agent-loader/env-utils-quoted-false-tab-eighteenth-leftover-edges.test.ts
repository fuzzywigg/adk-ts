import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EnvUtils } from "../../../../http/providers/agent-loader/env-utils";

/**
 * Eighteenth leftover (logger/env residual): EnvUtils quoted `"false"` / `"true"` strip+keep;
 * TAB-only lines skipped after trim; unquoted `false` assigns string.
 */
describe("EnvUtils quoted-false / tab-line / unquoted-false eighteenth leftover", () => {
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
			line: 'FALSE_Q="false"\n',
			key: "FALSE_Q",
			expect: "false",
		},
		{ label: '"true"', line: 'TRUE_Q="true"\n', key: "TRUE_Q", expect: "true" },
	] as const)("KEY=$label strips quotes and assigns string", ({
		line,
		key,
		expect: expected,
	}) => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-qbool-"));
		const agentFile = agentUnder(root);
		writeFileSync(join(root, ".env"), line);
		delete process.env[key];

		const utils = new EnvUtils({ warn: vi.fn() } as never, true);
		utils.loadEnvironmentVariables(agentFile);

		expect(process.env[key]).toBe(expected);
	});

	it("unquoted KEY=false assigns string false (no boolean coerce)", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-unq-false-"));
		const agentFile = agentUnder(root);
		writeFileSync(join(root, ".env"), "UNQ_FALSE=false\n");
		delete process.env.UNQ_FALSE;

		const utils = new EnvUtils({ warn: vi.fn() } as never, true);
		utils.loadEnvironmentVariables(agentFile);

		expect(process.env.UNQ_FALSE).toBe("false");
	});

	it("TAB-only line is skipped after trim (falsy trimmed)", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-tab-line-"));
		const agentFile = agentUnder(root);
		writeFileSync(join(root, ".env"), "\t\t\nAFTER_TAB=yes\n");
		delete process.env.AFTER_TAB;

		const utils = new EnvUtils({ warn: vi.fn() } as never, true);
		utils.loadEnvironmentVariables(agentFile);

		expect(process.env.AFTER_TAB).toBe("yes");
	});
});
