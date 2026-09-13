import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Logger } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EnvUtils } from "../../../../http/providers/agent-loader/env-utils";

describe("EnvUtils", () => {
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

	it("describes missing env vars when no env files exist", () => {
		const utils = new EnvUtils(new Logger("EnvUtilsTest"), true);
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-missing-"));
		const message = utils.generateEnvErrorMessage(root, "API_KEY", [
			"API_KEY",
			"SECRET",
		]);

		expect(message).toContain("MISSING ENVIRONMENT VARIABLES");
		expect(message).toContain("API_KEY, SECRET");
		expect(message).toContain("Create a .env file");
		expect(message).toContain("API_KEY=your_value_here");
	});

	it("points at existing env files when present", () => {
		const utils = new EnvUtils(new Logger("EnvUtilsTest"), true);
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-found-"));
		writeFileSync(join(root, ".env"), "EXISTING=1\n");
		writeFileSync(join(root, ".env.local"), "LOCAL=1\n");

		const message = utils.generateEnvErrorMessage(root, "API_KEY");
		expect(message).toContain("Found: .env.local, .env");
		expect(message).toContain("Add missing variable");
	});

	it("loads env files without overwriting existing process.env values", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-load-"));
		writeFileSync(join(root, "package.json"), "{}");
		const agentsDir = join(root, "agents");
		mkdirSync(agentsDir, { recursive: true });
		const agentFile = join(agentsDir, "agent.ts");
		writeFileSync(agentFile, "export {}");
		writeFileSync(
			join(root, ".env"),
			'NEW_VAR=from-env\nEXISTING_VAR="ignored"\n',
		);

		process.env.EXISTING_VAR = "keep-me";
		delete process.env.NEW_VAR;

		const warn = vi.fn();
		const utils = new EnvUtils({ warn } as unknown as Logger, false);
		utils.loadEnvironmentVariables(agentFile);

		expect(process.env.NEW_VAR).toBe("from-env");
		expect(process.env.EXISTING_VAR).toBe("keep-me");
	});

	it("warns when no env files are found", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-none-"));
		writeFileSync(join(root, "package.json"), "{}");
		const agentFile = join(root, "agent.ts");
		writeFileSync(agentFile, "export {}");

		const warn = vi.fn();
		const utils = new EnvUtils({ warn } as unknown as Logger, false);
		utils.loadEnvironmentVariables(agentFile);

		expect(warn).toHaveBeenCalled();
		expect(String(warn.mock.calls[0][0])).toContain("No .env files found");
	});

	it("skips comments, blank lines, and keys without values while loading", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-comments-"));
		writeFileSync(join(root, "package.json"), "{}");
		const agentFile = join(root, "agent.ts");
		writeFileSync(agentFile, "export {}");
		writeFileSync(
			join(root, ".env"),
			[
				"# comment",
				"",
				"  ",
				"NO_VALUE",
				"QUOTED_EQ=a=b=c",
				'QUOTED="value"',
			].join("\n"),
		);

		delete process.env.NO_VALUE;
		delete process.env.QUOTED_EQ;
		delete process.env.QUOTED;

		const utils = new EnvUtils(new Logger("EnvUtilsTest"), true);
		utils.loadEnvironmentVariables(agentFile);

		expect(process.env.NO_VALUE).toBeUndefined();
		expect(process.env.QUOTED_EQ).toBe("a=b=c");
		expect(process.env.QUOTED).toBe("value");
	});

	it("stays quiet when no env files exist and quiet=true", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-quiet-"));
		writeFileSync(join(root, "package.json"), "{}");
		const agentFile = join(root, "agent.ts");
		writeFileSync(agentFile, "export {}");

		const warn = vi.fn();
		const utils = new EnvUtils({ warn } as unknown as Logger, true);
		utils.loadEnvironmentVariables(agentFile);
		expect(warn).not.toHaveBeenCalled();
	});

	it("describes singular missing env var wording", () => {
		const utils = new EnvUtils(new Logger("EnvUtilsTest"), true);
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-singular-"));
		const message = utils.generateEnvErrorMessage(root, "ONLY_ONE");
		expect(message).toContain("MISSING ENVIRONMENT VARIABLE\n");
		expect(message).not.toContain("MISSING ENVIRONMENT VARIABLES");
		expect(message).toContain("Required: ONLY_ONE");
	});
});
