import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const watchHandlers: Array<{
	close: ReturnType<typeof vi.fn>;
	handler: (...args: any[]) => void;
}> = [];

vi.mock("node:fs", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:fs")>();
	return {
		...actual,
		watch: vi.fn(
			(_path: string, _opts: unknown, cb: (...args: any[]) => void) => {
				const watcher = { close: vi.fn(), handler: cb };
				watchHandlers.push(watcher);
				return watcher;
			},
		),
	};
});

vi.mock("@iqai/adk", () => ({
	AgentBuilder: {
		create: vi.fn(),
	},
}));

vi.mock("@nestjs/core", () => ({
	NestFactory: {
		create: vi.fn(),
	},
}));

vi.mock("@nestjs/swagger", () => ({
	DocumentBuilder: vi.fn(function DocumentBuilder(this: any) {
		this.setTitle = vi.fn().mockReturnThis();
		this.setDescription = vi.fn().mockReturnThis();
		this.setVersion = vi.fn().mockReturnThis();
		this.addTag = vi.fn().mockReturnThis();
		this.build = vi.fn().mockReturnValue({ openapi: "3.0.0" });
		return this;
	}),
	SwaggerModule: {
		createDocument: vi.fn().mockReturnValue({ paths: {} }),
		setup: vi.fn(),
	},
}));

vi.mock("../../http/http.module", () => ({
	HttpModule: { register: vi.fn((config) => ({ module: true, config })) },
}));

vi.mock("../../http/filters/pretty-error.filter", () => ({
	PrettyErrorFilter: vi.fn(function PrettyErrorFilter() {
		return {};
	}),
}));

const { NestFactory } = await import("@nestjs/core");
const { SwaggerModule } = await import("@nestjs/swagger");
const {
	loadGitignorePrefixes,
	pathHasSkippedDir,
	setupHotReload,
	shouldIgnorePath,
	startHttpServer,
} = await import("../../http/bootstrap");
const { DIRECTORIES_TO_SKIP } = await import(
	"../../http/providers/agent-scanner.service"
);
const { AgentManager } = await import(
	"../../http/providers/agent-manager.service"
);
const { HotReloadService } = await import(
	"../../http/reload/hot-reload.service"
);

describe("bootstrap path helpers", () => {
	it("pathHasSkippedDir detects well-known directories", () => {
		expect(pathHasSkippedDir(`/tmp/proj${sep}node_modules${sep}x`)).toBe(true);
		expect(pathHasSkippedDir(`/tmp/proj${sep}src${sep}agent.ts`)).toBe(false);
		for (const dir of DIRECTORIES_TO_SKIP.slice(0, 3)) {
			expect(pathHasSkippedDir(join("/tmp", dir, "file.ts"))).toBe(true);
		}
	});

	it("loadGitignorePrefixes skips comments, blanks, and glob lines", () => {
		const root = mkdtempSync(join(tmpdir(), "adk-cli-gitignore-"));
		writeFileSync(
			join(root, ".gitignore"),
			["# comment", "", "dist/", "node_modules", "*.log", "coverage"].join(
				"\n",
			),
		);

		const prefixes = loadGitignorePrefixes(root);
		expect(prefixes).toEqual(
			expect.arrayContaining([
				resolve(root, "dist") + sep,
				resolve(root, "node_modules") + sep,
				resolve(root, "coverage") + sep,
			]),
		);
		expect(prefixes.every((p) => !p.includes("*.log"))).toBe(true);
	});

	it("loadGitignorePrefixes returns empty when missing", () => {
		expect(loadGitignorePrefixes(join(tmpdir(), "missing-adk-root"))).toEqual(
			[],
		);
	});

	it("shouldIgnorePath combines skipped dirs and gitignore prefixes", () => {
		const prefix = `/tmp/ignored${sep}`;
		expect(shouldIgnorePath(`/tmp/ignored${sep}a.ts`, [prefix])).toBe(true);
		expect(shouldIgnorePath(`/tmp/ok${sep}a.ts`, [prefix])).toBe(false);
		expect(shouldIgnorePath(`/tmp/node_modules${sep}x`, [])).toBe(true);
	});
});

describe("setupHotReload", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		watchHandlers.length = 0;
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.clearAllMocks();
	});

	it("no-ops when hot reload is disabled", () => {
		const result = setupHotReload(
			{} as never,
			undefined,
			{
				host: "localhost",
				port: 1,
				agentsDir: "/tmp",
				quiet: true,
				hotReload: false,
			},
			{
				NODE_ENV: "development",
				ADK_DEBUG: false,
				ADK_HTTP_BODY_LIMIT: "1mb",
				ADK_VERBOSE: false,
			},
		);
		expect(result.watchers).toEqual([]);
		expect(result.teardownHotReload).toBeTypeOf("function");
	});

	it("watches paths, reloads on change, and tears down cleanly", async () => {
		const agentManager = {
			hasInitialStateChanged: vi.fn().mockResolvedValue(false),
			stopAllAgents: vi.fn(),
			scanAgents: vi.fn(),
			getLoadedAgentSessions: vi
				.fn()
				.mockReturnValue(new Map([["/agents/a", "s1"]])),
			getAgents: vi.fn().mockReturnValue(new Map([["/agents/a", {}]])),
			startAgent: vi.fn().mockResolvedValue(undefined),
		};
		const hotReload = {
			broadcastReload: vi.fn(),
			closeAll: vi.fn(),
		};

		const { teardownHotReload } = setupHotReload(
			agentManager as never,
			hotReload as never,
			{
				host: "localhost",
				port: 1,
				agentsDir: "/agents",
				quiet: true,
				hotReload: true,
				watchPaths: [process.cwd()],
			},
			{
				NODE_ENV: "development",
				ADK_DEBUG: true,
				ADK_HTTP_BODY_LIMIT: "1mb",
				ADK_VERBOSE: false,
			},
		);

		expect(watchHandlers.length).toBeGreaterThan(0);
		watchHandlers[0].handler("change", "src/agent.ts");
		await vi.advanceTimersByTimeAsync(300);

		expect(agentManager.stopAllAgents).toHaveBeenCalled();
		expect(agentManager.scanAgents).toHaveBeenCalledWith("/agents");
		expect(agentManager.startAgent).toHaveBeenCalledWith("/agents/a", "s1");
		expect(hotReload.broadcastReload).toHaveBeenCalledWith("src/agent.ts");

		teardownHotReload();
		expect(watchHandlers[0].close).toHaveBeenCalled();
		expect(hotReload.closeAll).toHaveBeenCalled();
	});

	it("full-reloads when initial state changes", async () => {
		watchHandlers.length = 0;
		const agentManager = {
			hasInitialStateChanged: vi.fn().mockResolvedValue(true),
			stopAllAgents: vi.fn(),
			scanAgents: vi.fn(),
			getLoadedAgentSessions: vi.fn(),
			getAgents: vi.fn().mockReturnValue(new Map([["/agents/b", {}]])),
			startAgent: vi.fn().mockResolvedValue(undefined),
		};

		setupHotReload(
			agentManager as never,
			undefined,
			{
				host: "localhost",
				port: 1,
				agentsDir: "/agents",
				quiet: true,
				hotReload: true,
				watchPaths: [process.cwd()],
			},
			{
				NODE_ENV: "development",
				ADK_DEBUG: false,
				ADK_HTTP_BODY_LIMIT: "1mb",
				ADK_VERBOSE: false,
			},
		);

		expect(watchHandlers.length).toBeGreaterThan(0);
		watchHandlers[0].handler("change", "state.ts");
		await vi.advanceTimersByTimeAsync(300);
		expect(agentManager.startAgent).toHaveBeenCalledWith(
			"/agents/b",
			undefined,
			true,
		);
	});
});

describe("startHttpServer", () => {
	const originalEnv = { ...process.env };

	afterEach(() => {
		process.env = { ...originalEnv };
		vi.clearAllMocks();
	});

	it("boots Nest app with swagger, cors, and stop cleanup", async () => {
		process.env.NODE_ENV = "development";
		process.env.ADK_DEBUG = "true";

		const stopAllAgents = vi.fn();
		const scanAgents = vi.fn();
		const closeAll = vi.fn();
		const agentManager = {
			stopAllAgents,
			scanAgents,
			getAgents: () => new Map(),
			hasInitialStateChanged: vi.fn(),
			getLoadedAgentSessions: vi.fn().mockReturnValue(new Map()),
			startAgent: vi.fn(),
		};
		const hotReload = { closeAll, broadcastReload: vi.fn() };

		const app = {
			useGlobalFilters: vi.fn(),
			enableCors: vi.fn(),
			useBodyParser: vi.fn(),
			get: vi.fn((token: unknown) => {
				if (token === AgentManager) return agentManager;
				if (token === HotReloadService) return hotReload;
				return undefined;
			}),
			listen: vi.fn().mockResolvedValue(undefined),
			close: vi.fn().mockResolvedValue(undefined),
		};

		(NestFactory.create as any).mockResolvedValue(app);
		(SwaggerModule.createDocument as any).mockReturnValue({ paths: {} });

		const started = await startHttpServer({
			host: "127.0.0.1",
			port: 18042,
			agentsDir: "/agents",
			quiet: false,
			hotReload: false,
			swagger: true,
		});

		expect(NestFactory.create).toHaveBeenCalled();
		expect(app.enableCors).toHaveBeenCalled();
		expect(app.useBodyParser).toHaveBeenCalledWith(
			"json",
			expect.objectContaining({ limit: expect.any(String) }),
		);
		expect(SwaggerModule.setup).toHaveBeenCalled();
		expect((SwaggerModule.setup as any).mock.calls[0][0]).toBe("docs");
		expect((SwaggerModule.setup as any).mock.calls[0][3]).toEqual(
			expect.objectContaining({ jsonDocumentUrl: "/openapi.json" }),
		);
		expect(scanAgents).toHaveBeenCalledWith("/agents");
		expect(app.listen).toHaveBeenCalledWith(18042, "127.0.0.1");
		expect(started.url).toBe("http://127.0.0.1:18042");

		await started.stop();
		expect(stopAllAgents).toHaveBeenCalled();
		expect(app.close).toHaveBeenCalled();
	});

	it("skips swagger when disabled", async () => {
		process.env.NODE_ENV = "production";
		const app = {
			useGlobalFilters: vi.fn(),
			enableCors: vi.fn(),
			useBodyParser: vi.fn(),
			get: vi.fn(() => ({
				stopAllAgents: vi.fn(),
				scanAgents: vi.fn(),
				closeAll: vi.fn(),
			})),
			listen: vi.fn().mockResolvedValue(undefined),
			close: vi.fn().mockResolvedValue(undefined),
		};
		(NestFactory.create as any).mockResolvedValue(app);
		(SwaggerModule.setup as any).mockClear();

		await startHttpServer({
			host: "localhost",
			port: 9,
			agentsDir: ".",
			quiet: true,
			hotReload: false,
			swagger: false,
		});

		expect(SwaggerModule.setup).not.toHaveBeenCalled();
	});
});
