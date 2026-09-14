import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EnvUtils } from "../../../../http/providers/agent-loader/env-utils";

/**
 * Leftover: quoted-value strip /^"(.*)"$/; NOEQUALS line skipped;
 * MULTI=a=b keeps a=b via join("=").
 */
describe("EnvUtils quote strip / no-equals leftover edges", () => {
	const keys = ["ADK_LEFTOVER_Q", "ADK_LEFTOVER_NOEQ", "ADK_LEFTOVER_MULTI"];

	afterEach(() => {
		for (const key of keys) {
			delete process.env[key];
		}
	});

	it("strips surrounding quotes, skips key-only lines, keeps embedded =", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-quote-"));
		writeFileSync(join(root, "package.json"), "{}");
		const agentsDir = join(root, "agents");
		mkdirSync(agentsDir, { recursive: true });
		const agentFile = join(agentsDir, "agent.ts");
		writeFileSync(agentFile, "export {}");
		writeFileSync(
			join(root, ".env"),
			'ADK_LEFTOVER_Q="hello"\nADK_LEFTOVER_NOEQ\nADK_LEFTOVER_MULTI=a=b=c\n',
		);

		const utils = new EnvUtils({ warn: vi.fn() } as never, true);
		utils.loadEnvironmentVariables(agentFile);

		expect(process.env.ADK_LEFTOVER_Q).toBe("hello");
		expect(process.env.ADK_LEFTOVER_NOEQ).toBeUndefined();
		expect(process.env.ADK_LEFTOVER_MULTI).toBe("a=b=c");
	});
});
