import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentLoader } from "../../../http/providers/agent-loader.service";
import {
	CACHE_DIR,
	CacheUtils,
} from "../../../http/providers/agent-loader/cache-utils";

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

	it("reuses cached build output on a second import", async () => {
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
		writeFileSync(agentFile, `export const agent = { name: "cached_demo" };`);

		const loader = new AgentLoader(true);
		const first = await loader.importTypeScriptFile(agentFile, root, true);
		expect((first as any).agent?.name || (first as any).default?.name).toBe(
			"cached_demo",
		);

		const cacheDir = join(root, CACHE_DIR);
		expect(existsSync(cacheDir)).toBe(true);
		const cacheFiles = readdirSync(cacheDir).filter((f) => f.endsWith(".cjs"));
		expect(cacheFiles).toHaveLength(1);
		const outFile = join(cacheDir, cacheFiles[0]);
		const mtimeBefore = statSync(outFile).mtimeMs;

		const second = await loader.importTypeScriptFile(agentFile, root, false);
		expect((second as any).agent?.name || (second as any).default?.name).toBe(
			"cached_demo",
		);
		expect(statSync(outFile).mtimeMs).toBe(mtimeBefore);
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
