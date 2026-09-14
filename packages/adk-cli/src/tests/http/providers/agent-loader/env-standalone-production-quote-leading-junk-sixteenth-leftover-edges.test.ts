import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadEnvironmentVariables } from "../../../../http/providers/agent-loader/env";

/**
 * Sixteenth leftover: standalone env.ts bare `.env.production` mid-list
 * precedence (fifteenth covered `.env.development` only); leading junk before
 * opening `"` refuses strip (fifteenth trailing-junk on EnvUtils); key with
 * surrounding spaces trims; optional logger on EISDIR dual-path absent
 * (standalone has no loadedAny warn).
 */
describe("standalone env.ts production / quote leading-junk sixteenth leftover", () => {
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

	it(".env.production wins over later .env (standalone mid-list)", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-envts-prod-"));
		const agentFile = agentUnder(root);
		writeFileSync(join(root, ".env.production"), "STANDALONE_PROD=from-prod\n");
		writeFileSync(join(root, ".env"), "STANDALONE_PROD=from-dotenv\n");
		delete process.env.STANDALONE_PROD;

		loadEnvironmentVariables(agentFile);

		expect(process.env.STANDALONE_PROD).toBe("from-prod");
	});

	it('leading junk before opening " refuses strip via /^"(.*)"$/', () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-envts-lead-q-"));
		const agentFile = agentUnder(root);
		writeFileSync(join(root, ".env"), 'KEY=pre"val"\n');
		delete process.env.KEY;

		loadEnvironmentVariables(agentFile);

		expect(process.env.KEY).toBe('pre"val"');
	});

	it("trims key whitespace; valueParts join keeps embedded =", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-envts-trim-eq-"));
		const agentFile = agentUnder(root);
		writeFileSync(join(root, ".env"), "  TRIM_KEY=a=b=c\n");
		delete process.env.TRIM_KEY;

		loadEnvironmentVariables(agentFile);

		expect(process.env.TRIM_KEY).toBe("a=b=c");
	});

	it("optional logger.warn on EISDIR; no loadedAny dual missing warn", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-envts-eisdir-"));
		const agentFile = agentUnder(root);
		mkdirSync(join(root, ".env"));
		const warn = vi.fn();
		loadEnvironmentVariables(agentFile, { warn } as never);
		expect(warn).toHaveBeenCalledTimes(1);
		expect(String(warn.mock.calls[0][0])).toContain(
			"Warning: Could not load .env file:",
		);
	});
});
