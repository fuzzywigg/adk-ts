import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Logger } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { EnvUtils } from "../../../../http/providers/agent-loader/env-utils";

describe("EnvUtils leftover edges (TOKENMAXX adk-cli)", () => {
	it("formats a singular missing-variable banner without a required list", () => {
		const utils = new EnvUtils(new Logger("EnvUtilsLeftover"), true);
		const message = utils.generateEnvErrorMessage("/tmp/project");
		expect(message).toContain("MISSING ENVIRONMENT VARIABLE\n");
		expect(message).toContain("Create a .env file");
		expect(message).not.toContain("Required:");
	});

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
});
