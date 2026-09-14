import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EnvUtils } from "../../../../http/providers/agent-loader/env-utils";

/**
 * Leftover EnvUtils edges not covered by empty-overwrite / allMissing leftovers:
 * quiet suppresses missing-.env warn; EISDIR catch warns; quote strip is
 * double-quote-only; earlier env file wins via !process.env[key] gate.
 */
describe("EnvUtils quiet/catch/quote/precedence leftover edges", () => {
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

	it("quiet=true suppresses No .env files found warning", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-quiet-"));
		const agentFile = agentUnder(root);
		const warn = vi.fn();
		const utils = new EnvUtils({ warn } as never, true);
		utils.loadEnvironmentVariables(agentFile);
		expect(warn).not.toHaveBeenCalled();
	});

	it("quiet=false still warns when no env files exist (control)", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-loud-"));
		const agentFile = agentUnder(root);
		const warn = vi.fn();
		const utils = new EnvUtils({ warn } as never, false);
		utils.loadEnvironmentVariables(agentFile);
		expect(warn).toHaveBeenCalled();
		expect(String(warn.mock.calls[0][0])).toContain("No .env files found");
	});

	it("warns Could not load when .env path is a directory (EISDIR catch)", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-eisdir-"));
		const agentFile = agentUnder(root);
		mkdirSync(join(root, ".env"));
		const warn = vi.fn();
		const utils = new EnvUtils({ warn } as never, true);
		utils.loadEnvironmentVariables(agentFile);
		expect(warn).toHaveBeenCalled();
		expect(String(warn.mock.calls[0][0])).toContain(
			"Warning: Could not load .env file:",
		);
	});

	it('strips matching double quotes via replace(/^"(.*)"$/, "$1")', () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-dq-"));
		const agentFile = agentUnder(root);
		writeFileSync(
			join(root, ".env"),
			'DOUBLE_Q="hello world"\nEMBED_EQ="a=b=c"\n',
		);
		delete process.env.DOUBLE_Q;
		delete process.env.EMBED_EQ;

		const utils = new EnvUtils({ warn: vi.fn() } as never, true);
		utils.loadEnvironmentVariables(agentFile);

		expect(process.env.DOUBLE_Q).toBe("hello world");
		expect(process.env.EMBED_EQ).toBe("a=b=c");
	});

	it("does not strip single quotes (regex is double-quote only)", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-sq-"));
		const agentFile = agentUnder(root);
		writeFileSync(join(root, ".env"), "SINGLE_Q='kept'\n");
		delete process.env.SINGLE_Q;

		const utils = new EnvUtils({ warn: vi.fn() } as never, true);
		utils.loadEnvironmentVariables(agentFile);

		expect(process.env.SINGLE_Q).toBe("'kept'");
	});

	it("does not strip unbalanced double quotes", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-unbal-"));
		const agentFile = agentUnder(root);
		writeFileSync(join(root, ".env"), 'PARTIAL_Q="only-open\n');
		delete process.env.PARTIAL_Q;

		const utils = new EnvUtils({ warn: vi.fn() } as never, true);
		utils.loadEnvironmentVariables(agentFile);

		expect(process.env.PARTIAL_Q).toBe('"only-open');
	});

	it(".env.local wins over later .env for same key (!process.env gate)", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-prec-"));
		const agentFile = agentUnder(root);
		writeFileSync(join(root, ".env.local"), "SAME_KEY=from-local\n");
		writeFileSync(join(root, ".env"), "SAME_KEY=from-dotenv\n");
		delete process.env.SAME_KEY;

		const utils = new EnvUtils({ warn: vi.fn() } as never, true);
		utils.loadEnvironmentVariables(agentFile);

		expect(process.env.SAME_KEY).toBe("from-local");
	});

	it("trims key whitespace and skips lines without '=' (valueParts empty)", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-keytrim-"));
		const agentFile = agentUnder(root);
		writeFileSync(join(root, ".env"), "  TRIM_KEY=ok\nNOEQUALS\n=novalue\n");
		delete process.env.TRIM_KEY;
		delete process.env.NOEQUALS;

		const utils = new EnvUtils({ warn: vi.fn() } as never, true);
		utils.loadEnvironmentVariables(agentFile);

		expect(process.env.TRIM_KEY).toBe("ok");
		expect(process.env.NOEQUALS).toBeUndefined();
		expect(process.env[""]).toBeUndefined();
	});

	it("value.trim() strips trailing/leading spaces after quote strip", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-vtrim-"));
		const agentFile = agentUnder(root);
		writeFileSync(
			join(root, ".env"),
			'PADDED=  spaced  \nQ_PADDED="  quoted  "\n',
		);
		delete process.env.PADDED;
		delete process.env.Q_PADDED;

		const utils = new EnvUtils({ warn: vi.fn() } as never, true);
		utils.loadEnvironmentVariables(agentFile);

		expect(process.env.PADDED).toBe("spaced");
		expect(process.env.Q_PADDED).toBe("quoted");
	});

	it("keeps process.env 'false' / ' ' (truthy strings) against .env overwrite", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-truthy-str-"));
		const agentFile = agentUnder(root);
		writeFileSync(
			join(root, ".env"),
			"FALSE_KEEP=from-file\nSPACE_KEEP=from-file\n",
		);
		process.env.FALSE_KEEP = "false";
		process.env.SPACE_KEEP = " ";

		const utils = new EnvUtils({ warn: vi.fn() } as never, true);
		utils.loadEnvironmentVariables(agentFile);

		expect(process.env.FALSE_KEEP).toBe("false");
		expect(process.env.SPACE_KEEP).toBe(" ");
	});

	it(".env.development wins over later .env for same key (mid-list priority)", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-dev-"));
		const agentFile = agentUnder(root);
		writeFileSync(join(root, ".env.development"), "MID_KEY=from-dev\n");
		writeFileSync(join(root, ".env"), "MID_KEY=from-dotenv\n");
		delete process.env.MID_KEY;

		const utils = new EnvUtils({ warn: vi.fn() } as never, true);
		utils.loadEnvironmentVariables(agentFile);

		expect(process.env.MID_KEY).toBe("from-dev");
	});

	it("leading-whitespace # line is comment after trim (startsWith('#') post-trim)", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-env-ws-hash-"));
		const agentFile = agentUnder(root);
		writeFileSync(join(root, ".env"), "  # SKIPPED=1\nKEEP_WS_HASH=ok\n");
		delete process.env.SKIPPED;
		delete process.env.KEEP_WS_HASH;

		const utils = new EnvUtils({ warn: vi.fn() } as never, true);
		utils.loadEnvironmentVariables(agentFile);

		expect(process.env.SKIPPED).toBeUndefined();
		expect(process.env.KEEP_WS_HASH).toBe("ok");
	});
});
