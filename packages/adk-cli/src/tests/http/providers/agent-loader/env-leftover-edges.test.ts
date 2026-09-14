import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadEnvironmentVariables } from "../../../../http/providers/agent-loader/env";

describe("agent-loader env.ts leftover edges (TOKENMAXX adk-cli)", () => {
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

	it("loads prioritized env files, skips comments/blank lines, and keeps existing values", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-fn-"));
		writeFileSync(join(root, "package.json"), "{}");
		const agentsDir = join(root, "agents");
		mkdirSync(agentsDir, { recursive: true });
		const agentFile = join(agentsDir, "agent.ts");
		writeFileSync(agentFile, "export {}");
		writeFileSync(
			join(root, ".env"),
			[
				"# comment",
				"",
				"NEW_FROM_ENV=plain",
				'QUOTED_FROM_ENV="quoted-value"',
				"EQUALS_FROM_ENV=a=b=c",
				"NO_VALUE_LINE",
				"EXISTING_FROM_ENV=should-not-win",
			].join("\n"),
		);
		writeFileSync(join(root, ".env.local"), "LOCAL_ONLY=1\n");

		process.env.EXISTING_FROM_ENV = "keep-me";
		delete process.env.NEW_FROM_ENV;
		delete process.env.QUOTED_FROM_ENV;
		delete process.env.EQUALS_FROM_ENV;
		delete process.env.LOCAL_ONLY;

		loadEnvironmentVariables(agentFile);

		expect(process.env.NEW_FROM_ENV).toBe("plain");
		expect(process.env.QUOTED_FROM_ENV).toBe("quoted-value");
		expect(process.env.EQUALS_FROM_ENV).toBe("a=b=c");
		expect(process.env.EXISTING_FROM_ENV).toBe("keep-me");
		expect(process.env.LOCAL_ONLY).toBe("1");
	});

	it("warns through the optional logger when an env file cannot be read", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-fn-warn-"));
		writeFileSync(join(root, "package.json"), "{}");
		const agentFile = join(root, "agent.ts");
		writeFileSync(agentFile, "export {}");
		mkdirSync(join(root, ".env"));

		const warn = vi.fn();
		loadEnvironmentVariables(agentFile, { warn } as never);
		expect(warn).toHaveBeenCalledWith(
			expect.stringContaining("Could not load"),
		);
	});
});
