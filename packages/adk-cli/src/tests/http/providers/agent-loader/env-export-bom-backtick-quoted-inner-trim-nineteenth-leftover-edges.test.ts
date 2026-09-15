import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadEnvironmentVariables } from "../../../../http/providers/agent-loader/env";
import { EnvUtils } from "../../../../http/providers/agent-loader/env-utils";

/**
 * Nineteenth leftover residual after providers tip #269 (complements #261 / #253):
 * #261 pinned TAB / single-quote keep / unquoted true / key.trim.
 * Residual: `export KEY=` becomes key "export KEY"; leading BOM stripped by
 * trim(); backtick `'true'`-style keep for `` `true` ``; quoted `" true "`
 * strip then value.trim → `true`; inline `#` kept in value.
 */
describe("EnvUtils/standalone export/BOM/backtick/quoted-inner-trim nineteenth leftover", () => {
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

	it("EnvUtils export PREFIX becomes part of key (not shell export)", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-export-"));
		const agentFile = agentUnder(root);
		writeFileSync(join(root, ".env"), "export EXPORTED=yes\n");
		delete process.env.EXPORTED;
		delete process.env["export EXPORTED"];

		const utils = new EnvUtils({ warn: vi.fn() } as never, true);
		utils.loadEnvironmentVariables(agentFile);

		expect(process.env.EXPORTED).toBeUndefined();
		expect(process.env["export EXPORTED"]).toBe("yes");
	});

	it("EnvUtils leading BOM on line stripped by trim() before key write", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-bom-"));
		const agentFile = agentUnder(root);
		writeFileSync(join(root, ".env"), "\uFEFFBOM_KEY=bomval\n");
		delete process.env.BOM_KEY;
		delete process.env["\uFEFFBOM_KEY"];

		const utils = new EnvUtils({ warn: vi.fn() } as never, true);
		utils.loadEnvironmentVariables(agentFile);

		expect(process.env.BOM_KEY).toBe("bomval");
		expect(process.env["\uFEFFBOM_KEY"]).toBeUndefined();
	});

	it("EnvUtils backtick-quoted `true` keeps backticks (double-quote strip only)", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-bt-"));
		const agentFile = agentUnder(root);
		writeFileSync(join(root, ".env"), "BT=`true`\n");
		delete process.env.BT;

		const utils = new EnvUtils({ warn: vi.fn() } as never, true);
		utils.loadEnvironmentVariables(agentFile);

		expect(process.env.BT).toBe("`true`");
	});

	it('EnvUtils KEY=" true " strips quotes then value.trim → true', () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-qtrim-"));
		const agentFile = agentUnder(root);
		writeFileSync(join(root, ".env"), 'DQ_INNER=" true "\n');
		delete process.env.DQ_INNER;

		const utils = new EnvUtils({ warn: vi.fn() } as never, true);
		utils.loadEnvironmentVariables(agentFile);

		expect(process.env.DQ_INNER).toBe("true");
	});

	it("EnvUtils HASH_IN=val#notcomment keeps # (startsWith # only on full line)", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-hashin-"));
		const agentFile = agentUnder(root);
		writeFileSync(join(root, ".env"), "HASH_IN=val#notcomment\n");
		delete process.env.HASH_IN;

		const utils = new EnvUtils({ warn: vi.fn() } as never, true);
		utils.loadEnvironmentVariables(agentFile);

		expect(process.env.HASH_IN).toBe("val#notcomment");
	});

	it("standalone export/BOM/backtick/quoted-inner-trim twins EnvUtils", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-envts-export-bom-"));
		const agentFile = agentUnder(root);
		writeFileSync(
			join(root, ".env"),
			[
				"export EXPORTED=yes",
				"\uFEFFBOM_KEY=bomval",
				"BT=`true`",
				'DQ_INNER=" true "',
				"HASH_IN=val#notcomment",
			].join("\n"),
		);
		delete process.env.EXPORTED;
		delete process.env["export EXPORTED"];
		delete process.env.BOM_KEY;
		delete process.env.BT;
		delete process.env.DQ_INNER;
		delete process.env.HASH_IN;

		loadEnvironmentVariables(agentFile);

		expect(process.env.EXPORTED).toBeUndefined();
		expect(process.env["export EXPORTED"]).toBe("yes");
		expect(process.env.BOM_KEY).toBe("bomval");
		expect(process.env.BT).toBe("`true`");
		expect(process.env.DQ_INNER).toBe("true");
		expect(process.env.HASH_IN).toBe("val#notcomment");
	});
});
