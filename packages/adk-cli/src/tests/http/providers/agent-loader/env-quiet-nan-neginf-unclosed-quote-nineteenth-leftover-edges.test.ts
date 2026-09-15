import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadEnvironmentVariables } from "../../../../http/providers/agent-loader/env";
import { EnvUtils } from "../../../../http/providers/agent-loader/env-utils";

/**
 * Nineteenth leftover residual deepen after tip #279 / 3a81cea:
 * #261 pinned quiet=`"true"`/`[]`/`-0`; tip pinned quiet=Infinity.
 * Residual: quiet=NaN still warns (falsy); quiet=-Infinity suppresses
 * (truthy twin of Infinity); unclosed `"true` keeps leading quote
 * (regex `^"(.*)"$` miss); empty `KEY=` assigns ""; EnvUtils + standalone.
 */
describe("EnvUtils/standalone quiet-NaN/-Infinity/unclosed-quote nineteenth leftover", () => {
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

	it("quiet=NaN does not suppress missing-.env warn (falsy residual)", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-quiet-nan-"));
		writeFileSync(join(root, "package.json"), "{}");
		const warn = vi.fn();
		const utils = new EnvUtils({ warn } as never, Number.NaN as any);
		utils.loadEnvironmentVariables(join(root, "agent.ts"));
		expect(warn).toHaveBeenCalled();
		expect(String(warn.mock.calls[0][0])).toContain("No .env files found");
	});

	it("quiet=-Infinity suppresses No .env files found warn (truthy residual)", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-quiet-neginf-"));
		writeFileSync(join(root, "package.json"), "{}");
		const warn = vi.fn();
		const utils = new EnvUtils(
			{ warn } as never,
			Number.NEGATIVE_INFINITY as any,
		);
		utils.loadEnvironmentVariables(join(root, "agent.ts"));
		expect(warn).not.toHaveBeenCalled();
	});

	it('EnvUtils unclosed KEY="true keeps leading quote (strip regex miss)', () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-unclosed-"));
		const agentFile = agentUnder(root);
		writeFileSync(join(root, ".env"), 'UNCLOSED="true\n');
		delete process.env.UNCLOSED;

		const utils = new EnvUtils({ warn: vi.fn() } as never, true);
		utils.loadEnvironmentVariables(agentFile);

		expect(process.env.UNCLOSED).toBe('"true');
	});

	it('EnvUtils closed KEY="true" control still strips outer quotes', () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-closed-"));
		const agentFile = agentUnder(root);
		writeFileSync(join(root, ".env"), 'CLOSED="true"\n');
		delete process.env.CLOSED;

		const utils = new EnvUtils({ warn: vi.fn() } as never, true);
		utils.loadEnvironmentVariables(agentFile);

		expect(process.env.CLOSED).toBe("true");
	});

	it("EnvUtils KEY= empty value assigns empty string (valueParts length truthy)", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-emptyval-"));
		const agentFile = agentUnder(root);
		writeFileSync(join(root, ".env"), "EMPTY=\n");
		delete process.env.EMPTY;

		const utils = new EnvUtils({ warn: vi.fn() } as never, true);
		utils.loadEnvironmentVariables(agentFile);

		expect(process.env.EMPTY).toBe("");
	});

	it("standalone unclosed quote + empty value twin EnvUtils", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-envts-unclosed-"));
		const agentFile = agentUnder(root);
		writeFileSync(
			join(root, ".env"),
			'UNCLOSED="true\nCLOSED="true"\nEMPTY=\n',
		);
		delete process.env.UNCLOSED;
		delete process.env.CLOSED;
		delete process.env.EMPTY;

		loadEnvironmentVariables(agentFile);

		expect(process.env.UNCLOSED).toBe('"true');
		expect(process.env.CLOSED).toBe("true");
		expect(process.env.EMPTY).toBe("");
	});
});
