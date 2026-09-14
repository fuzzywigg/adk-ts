import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EnvUtils } from "../../../../http/providers/agent-loader/env-utils";

/**
 * Sixteenth leftover: EISDIR on the only env file never sets loadedAny, so
 * quiet=false emits dual warns (Could not load + No .env files found). Bare
 * `.env.production` mid-list precedence (fifteenth covered *.production.local /
 * *.development.local / standalone .env.development only). allMissing falsy
 * primitives beyond null fall through to varName via ||.
 */
describe("EnvUtils EISDIR loadedAny / production midlist sixteenth leftover", () => {
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

	it("EISDIR-only .env with quiet=false → dual warn (catch never sets loadedAny)", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-eisdir-dual-"));
		const agentFile = agentUnder(root);
		mkdirSync(join(root, ".env"));
		const warn = vi.fn();
		const utils = new EnvUtils({ warn } as never, false);
		utils.loadEnvironmentVariables(agentFile);

		expect(warn).toHaveBeenCalledTimes(2);
		expect(String(warn.mock.calls[0][0])).toContain(
			"Warning: Could not load .env file:",
		);
		expect(String(warn.mock.calls[1][0])).toContain("No .env files found");
	});

	it("EISDIR .env + readable later .env still loads keys (catch continues loop)", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-eisdir-cont-"));
		const agentFile = agentUnder(root);
		mkdirSync(join(root, ".env.local"));
		writeFileSync(join(root, ".env"), "AFTER_EISDIR=ok\n");
		delete process.env.AFTER_EISDIR;
		const warn = vi.fn();
		const utils = new EnvUtils({ warn } as never, true);
		utils.loadEnvironmentVariables(agentFile);

		expect(process.env.AFTER_EISDIR).toBe("ok");
		expect(warn).toHaveBeenCalled();
		expect(String(warn.mock.calls[0][0])).toContain(
			"Warning: Could not load .env.local file:",
		);
	});

	it(".env.production wins over later .env for same key (bare mid-list)", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-prod-mid-"));
		const agentFile = agentUnder(root);
		writeFileSync(join(root, ".env.production"), "MID=from-prod\n");
		writeFileSync(join(root, ".env"), "MID=from-dotenv\n");
		delete process.env.MID;

		const utils = new EnvUtils({ warn: vi.fn() } as never, true);
		utils.loadEnvironmentVariables(agentFile);

		expect(process.env.MID).toBe("from-prod");
	});

	it.each([
		{ label: "false", allMissing: false },
		{ label: "0", allMissing: 0 },
		{ label: '""', allMissing: "" },
	] as const)("allMissing=$label falsy falls through to varName via ||", ({
		allMissing,
	}) => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-allmiss-falsy-"));
		const utils = new EnvUtils({ warn: vi.fn() } as never, true);
		const message = utils.generateEnvErrorMessage(
			root,
			"API_KEY",
			allMissing as unknown as string[],
		);
		expect(message).toContain("Required: API_KEY");
		expect(message).toContain("MISSING ENVIRONMENT VARIABLE\n");
		expect(message).not.toContain("VARIABLES");
	});
});
