import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { EnvUtils } from "../../../../http/providers/agent-loader/env-utils";

describe("EnvUtils unreadable / quiet leftover edges", () => {
	it("warns when an env file exists but cannot be parsed", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-utils-eacces-"));
		writeFileSync(join(root, "package.json"), "{}");
		const agentFile = join(root, "agent.ts");
		writeFileSync(agentFile, "export {}");
		mkdirSync(join(root, ".env"));

		const warn = vi.fn();
		const utils = new EnvUtils({ warn } as never, false);
		utils.loadEnvironmentVariables(agentFile);
		expect(warn).toHaveBeenCalledWith(
			expect.stringContaining("Could not load .env file:"),
		);
	});

	it("stays quiet when no env files exist and quiet=true", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-utils-quiet-"));
		writeFileSync(join(root, "package.json"), "{}");
		mkdirSync(join(root, "nested"), { recursive: true });
		const agentFile = join(root, "nested", "agent.ts");
		writeFileSync(agentFile, "export {}");

		const warn = vi.fn();
		const utils = new EnvUtils({ warn } as never, true);
		utils.loadEnvironmentVariables(agentFile);
		expect(warn).not.toHaveBeenCalled();
	});

	it("warns when no env files exist and quiet=false", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-utils-noisy-"));
		writeFileSync(join(root, "package.json"), "{}");
		const agentFile = join(root, "agent.ts");
		writeFileSync(agentFile, "export {}");

		const warn = vi.fn();
		const utils = new EnvUtils({ warn } as never, false);
		utils.loadEnvironmentVariables(agentFile);
		expect(warn).toHaveBeenCalledWith(
			expect.stringContaining("No .env files found"),
		);
	});
});
