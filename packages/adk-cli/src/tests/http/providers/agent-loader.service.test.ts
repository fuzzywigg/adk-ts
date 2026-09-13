import {
	mkdirSync,
	mkdtempSync,
	rmSync,
	utimesSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentLoader } from "../../../http/providers/agent-loader.service";
import { CacheUtils } from "../../../http/providers/agent-loader/cache-utils";

vi.mock("@nestjs/common", async () => {
	const actual =
		await vi.importActual<typeof import("@nestjs/common")>("@nestjs/common");
	return {
		...actual,
		Logger: class {
			log = vi.fn();
			warn = vi.fn();
			error = vi.fn();
			debug = vi.fn();
		},
	};
});

describe("AgentLoader", () => {
	const dirs: string[] = [];

	afterEach(() => {
		for (const dir of dirs.splice(0)) {
			rmSync(dir, { recursive: true, force: true });
		}
		vi.restoreAllMocks();
	});

	it("delegates loadEnvironmentVariables to EnvUtils", () => {
		const loader = new AgentLoader(true);
		const envSpy = vi
			.spyOn((loader as any).envUtils, "loadEnvironmentVariables")
			.mockImplementation(() => undefined);

		loader.loadEnvironmentVariables("/tmp/agent.ts");
		expect(envSpy).toHaveBeenCalledWith("/tmp/agent.ts");
	});

	it("resolveAgentExport delegates to AgentResolver", async () => {
		const loader = new AgentLoader(true);
		const agent = { name: "resolved" };
		const resolveSpy = vi
			.spyOn((loader as any).resolver, "resolveAgentExport")
			.mockResolvedValue(agent);

		const result = await loader.resolveAgentExport({
			agent,
		} as any);

		expect(resolveSpy).toHaveBeenCalled();
		expect(result).toEqual({ agent });
	});

	it("importTypeScriptFile builds via esbuild and loads the cache output", async () => {
		const root = mkdtempSync(join(tmpdir(), "adk-loader-"));
		dirs.push(root);
		writeFileSync(
			join(root, "package.json"),
			JSON.stringify({ name: "loader-demo" }),
		);
		writeFileSync(join(root, "tsconfig.json"), JSON.stringify({}));
		const agentDir = join(root, "agents", "demo");
		mkdirSync(agentDir, { recursive: true });
		const agentFile = join(agentDir, "agent.ts");
		writeFileSync(agentFile, `export const agent = { name: "compiled_demo" };`);

		const loader = new AgentLoader(true);
		const mod = await loader.importTypeScriptFile(agentFile, root, true);

		expect(mod).toBeTruthy();
		const name =
			(mod as any).agent?.name ||
			(mod as any).default?.agent?.name ||
			(mod as any).default?.name;
		expect(name).toBe("compiled_demo");
	});

	it("importTypeScriptFile wraps build failures", async () => {
		const root = mkdtempSync(join(tmpdir(), "adk-loader-miss-"));
		dirs.push(root);
		writeFileSync(
			join(root, "package.json"),
			JSON.stringify({ name: "loader-miss" }),
		);
		const agentDir = join(root, "agents", "miss");
		mkdirSync(agentDir, { recursive: true });
		const agentFile = join(agentDir, "agent.ts");
		writeFileSync(
			agentFile,
			`import 'definitely-missing-package-xyz'; export const agent = { name: "x" };`,
		);

		const loader = new AgentLoader(true);

		await expect(
			loader.importTypeScriptFile(agentFile, root, true),
		).rejects.toThrow(/Failed to import TS agent via esbuild/);
	});

	it("normalizes backslashes and detects rebuild need from mtimes", () => {
		const loader = new AgentLoader(true);
		expect((loader as any).normalizePath("a\\b\\c.ts")).toBe("a/b/c.ts");

		const root = mkdtempSync(join(tmpdir(), "adk-loader-rebuild-"));
		dirs.push(root);
		const src = join(root, "agent.ts");
		const out = join(root, "out.mjs");
		const tsconfig = join(root, "tsconfig.json");
		writeFileSync(src, "export const agent = { name: 'x' };");
		writeFileSync(tsconfig, "{}");

		expect((loader as any).isRebuildNeeded(out, src, tsconfig)).toBe(true);

		writeFileSync(out, "export const agent = { name: 'x' };");
		const past = new Date(Date.now() - 60_000);
		utimesSync(out, past, past);
		utimesSync(src, new Date(), new Date());
		expect((loader as any).isRebuildNeeded(out, src, tsconfig)).toBe(true);

		const future = new Date(Date.now() + 60_000);
		utimesSync(out, future, future);
		expect((loader as any).isRebuildNeeded(out, src, tsconfig)).toBe(false);
	});

	it("reuses cache when outFile is fresher unless forceInvalidateCache", async () => {
		const root = mkdtempSync(join(tmpdir(), "adk-loader-cache-"));
		dirs.push(root);
		writeFileSync(
			join(root, "package.json"),
			JSON.stringify({ name: "loader-cache" }),
		);
		writeFileSync(join(root, "tsconfig.json"), JSON.stringify({}));
		const agentDir = join(root, "agents", "cached");
		mkdirSync(agentDir, { recursive: true });
		const agentFile = join(agentDir, "agent.ts");
		writeFileSync(agentFile, `export const agent = { name: "first_compile" };`);

		const loader = new AgentLoader(true);
		const first = await loader.importTypeScriptFile(agentFile, root, true);
		expect((first as any).agent.name).toBe("first_compile");

		writeFileSync(
			agentFile,
			`export const agent = { name: "should_not_reload" };`,
		);
		const past = new Date(Date.now() - 120_000);
		utimesSync(agentFile, past, past);

		const cached = await loader.importTypeScriptFile(agentFile, root, false);
		expect((cached as any).agent.name).toBe("first_compile");

		const forced = await loader.importTypeScriptFile(agentFile, root, true);
		expect((forced as any).agent.name).toBe("should_not_reload");
	});

	it("cleanupAllCacheFiles delegates to CacheUtils", () => {
		const spy = vi
			.spyOn(CacheUtils, "cleanupAllCacheFiles")
			.mockImplementation(() => undefined);
		AgentLoader.cleanupAllCacheFiles(undefined, true);
		expect(spy).toHaveBeenCalledWith(undefined, true);
		spy.mockRestore();
	});
});
