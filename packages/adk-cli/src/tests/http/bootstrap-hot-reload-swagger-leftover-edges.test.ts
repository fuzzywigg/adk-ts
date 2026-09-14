import { EventEmitter } from "node:events";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
	createMock,
	listenMock,
	closeMock,
	useGlobalFiltersMock,
	enableCorsMock,
	useBodyParserMock,
	getMock,
	createDocumentMock,
	setupMock,
	watchMock,
} = vi.hoisted(() => ({
	createMock: vi.fn(),
	listenMock: vi.fn(),
	closeMock: vi.fn(),
	useGlobalFiltersMock: vi.fn(),
	enableCorsMock: vi.fn(),
	useBodyParserMock: vi.fn(),
	getMock: vi.fn(),
	createDocumentMock: vi.fn(),
	setupMock: vi.fn(),
	watchMock: vi.fn(),
}));

vi.mock("@nestjs/core", () => ({
	NestFactory: {
		create: (...args: unknown[]) => createMock(...args),
	},
}));

vi.mock("@nestjs/swagger", () => ({
	DocumentBuilder: class {
		setTitle() {
			return this;
		}
		setDescription() {
			return this;
		}
		setVersion() {
			return this;
		}
		addTag() {
			return this;
		}
		build() {
			return { openapi: "3.0.0" };
		}
	},
	SwaggerModule: {
		createDocument: (...args: unknown[]) => createDocumentMock(...args),
		setup: (...args: unknown[]) => setupMock(...args),
	},
}));

vi.mock("node:fs", async () => {
	const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
	return {
		...actual,
		watch: (...args: unknown[]) => watchMock(...args),
	};
});

vi.mock("../../http/http.module", () => ({
	HttpModule: {
		register: vi.fn(() => ({ module: class HttpModule {} })),
	},
}));

vi.mock("../../http/providers/agent-manager.service", () => ({
	AgentManager: class AgentManager {},
}));

vi.mock("../../http/reload/hot-reload.service", () => ({
	HotReloadService: class HotReloadService {},
}));

import { startHttpServer } from "../../http/bootstrap";
import { AgentManager } from "../../http/providers/agent-manager.service";
import { HotReloadService } from "../../http/reload/hot-reload.service";

class FakeWatcher extends EventEmitter {
	close = vi.fn();
}

describe("bootstrap hot-reload / swagger leftover edges", () => {
	const originalEnv = {
		NODE_ENV: process.env.NODE_ENV,
		ADK_DEBUG: process.env.ADK_DEBUG,
		ADK_DEBUG_NEST: process.env.ADK_DEBUG_NEST,
		ADK_HTTP_BODY_LIMIT: process.env.ADK_HTTP_BODY_LIMIT,
	};

	let agentManager: {
		scanAgents: ReturnType<typeof vi.fn>;
		stopAllAgents: ReturnType<typeof vi.fn>;
		hasInitialStateChanged: ReturnType<typeof vi.fn>;
		getAgents: ReturnType<typeof vi.fn>;
		startAgent: ReturnType<typeof vi.fn>;
		getLoadedAgentSessions: ReturnType<typeof vi.fn>;
	};
	let hotReload: {
		broadcastReload: ReturnType<typeof vi.fn>;
		closeAll: ReturnType<typeof vi.fn>;
	};

	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers();
		listenMock.mockResolvedValue(undefined);
		closeMock.mockResolvedValue(undefined);
		createDocumentMock.mockReturnValue({ paths: {} });
		agentManager = {
			scanAgents: vi.fn(),
			stopAllAgents: vi.fn(),
			hasInitialStateChanged: vi.fn().mockResolvedValue(false),
			getAgents: vi.fn().mockReturnValue(new Map()),
			startAgent: vi.fn().mockResolvedValue(undefined),
			getLoadedAgentSessions: vi.fn().mockReturnValue(new Map()),
		};
		hotReload = {
			broadcastReload: vi.fn(),
			closeAll: vi.fn(),
		};
		getMock.mockImplementation((token: unknown) => {
			if (token === AgentManager) return agentManager;
			if (token === HotReloadService) return hotReload;
			return undefined;
		});
		createMock.mockResolvedValue({
			listen: listenMock,
			close: closeMock,
			useGlobalFilters: useGlobalFiltersMock,
			enableCors: enableCorsMock,
			useBodyParser: useBodyParserMock,
			get: getMock,
		});
		watchMock.mockImplementation(() => new FakeWatcher());
		delete process.env.ADK_DEBUG;
		delete process.env.ADK_DEBUG_NEST;
		delete process.env.ADK_HTTP_BODY_LIMIT;
		process.env.NODE_ENV = "development";
	});

	afterEach(() => {
		vi.useRealTimers();
		for (const [key, value] of Object.entries(originalEnv)) {
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		}
	});

	const baseConfig = {
		host: "127.0.0.1",
		port: 18042,
		agentsDir: "/tmp/adk-cli-bootstrap-agents",
		quiet: true,
	};

	it("starts with debug logger, swagger, cors, and body limits then stops cleanly", async () => {
		process.env.ADK_DEBUG = "true";
		process.env.ADK_HTTP_BODY_LIMIT = "5mb";
		process.env.ADK_DEBUG_NEST = "1";

		const started = await startHttpServer({ ...baseConfig, quiet: false });

		expect(createMock).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				logger: ["log", "error", "warn", "debug", "verbose"],
			}),
		);
		expect(useGlobalFiltersMock).toHaveBeenCalled();
		expect(enableCorsMock).toHaveBeenCalledWith(
			expect.objectContaining({
				origin: true,
				methods: expect.arrayContaining(["GET", "POST"]),
			}),
		);
		expect(useBodyParserMock).toHaveBeenCalledWith("json", { limit: "5mb" });
		expect(useBodyParserMock).toHaveBeenCalledWith("urlencoded", {
			limit: "5mb",
			extended: true,
		});
		expect(setupMock).toHaveBeenCalled();
		expect(setupMock.mock.calls[0][0]).toBe("docs");
		expect(setupMock.mock.calls[0][3]).toEqual(
			expect.objectContaining({ jsonDocumentUrl: "/openapi.json" }),
		);
		expect(agentManager.scanAgents).toHaveBeenCalledWith(baseConfig.agentsDir);
		expect(listenMock).toHaveBeenCalledWith(18042, "127.0.0.1");
		expect(started.url).toBe("http://127.0.0.1:18042");

		await started.stop();
		expect(agentManager.stopAllAgents).toHaveBeenCalled();
		expect(hotReload.closeAll).toHaveBeenCalled();
		expect(closeMock).toHaveBeenCalled();
	});

	it("skips swagger and watching in production unless explicitly enabled", async () => {
		process.env.NODE_ENV = "production";
		const started = await startHttpServer({
			...baseConfig,
			hotReload: false,
			swagger: false,
		});
		expect(setupMock).not.toHaveBeenCalled();
		expect(watchMock).not.toHaveBeenCalled();
		await started.stop();
	});

	it("skips watchers when hotReload is false even in development", async () => {
		const started = await startHttpServer({
			...baseConfig,
			hotReload: false,
		});
		expect(watchMock).not.toHaveBeenCalled();
		await started.stop();
	});

	it("watches extra paths, ignores skipped dirs and gitignore prefixes, then restores sessions", async () => {
		process.env.ADK_DEBUG = "true";
		const root = mkdtempSync(join(tmpdir(), "adk-cli-bootstrap-watch-"));
		writeFileSync(
			join(root, ".gitignore"),
			["# ignore", "", "tmp/", "weird*[", "  "].join("\n"),
		);
		const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(root);
		const watcher = new FakeWatcher();
		watchMock.mockReturnValue(watcher);

		const started = await startHttpServer({
			...baseConfig,
			quiet: false,
			hotReload: true,
			watchPaths: ["src", ""],
		});

		expect(watchMock).toHaveBeenCalled();
		const fsCallback = watchMock.mock.calls[0][2] as (
			event: string,
			filename: string | Buffer | null,
		) => void;

		const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
		fsCallback("change", join("node_modules", "pkg", "index.js"));
		expect(agentManager.hasInitialStateChanged).not.toHaveBeenCalled();

		fsCallback("change", join("tmp", "ignored.js"));
		expect(agentManager.hasInitialStateChanged).not.toHaveBeenCalled();

		agentManager.getLoadedAgentSessions.mockReturnValue(
			new Map([["agent-a", "sess-1"]]),
		);
		fsCallback("change", "src/agent.ts");
		await vi.advanceTimersByTimeAsync(300);
		expect(agentManager.stopAllAgents).toHaveBeenCalled();
		expect(agentManager.startAgent).toHaveBeenCalledWith("agent-a", "sess-1");
		expect(hotReload.broadcastReload).toHaveBeenCalledWith("src/agent.ts");

		await started.stop();
		expect(watcher.close).toHaveBeenCalled();
		cwdSpy.mockRestore();
		log.mockRestore();
	});

	it("full-reloads agents when initial state changed and continues after per-agent failures", async () => {
		process.env.ADK_DEBUG = "true";
		const watcher = new FakeWatcher();
		watchMock.mockReturnValue(watcher);
		agentManager.hasInitialStateChanged.mockResolvedValue(true);
		agentManager.getAgents.mockReturnValue(
			new Map([
				["ok", {}],
				["bad", {}],
			]),
		);
		agentManager.startAgent.mockImplementation(async (path: string) => {
			if (path === "bad") throw new Error("start failed");
		});
		const error = vi
			.spyOn(console, "error")
			.mockImplementation(() => undefined);
		const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

		const started = await startHttpServer({
			...baseConfig,
			quiet: false,
			hotReload: true,
			watchPaths: [process.cwd()],
		});
		const fsCallback = watchMock.mock.calls[0][2] as (
			event: string,
			filename: string | null,
		) => void;
		fsCallback("change", "agent.ts");
		await vi.advanceTimersByTimeAsync(300);
		expect(agentManager.startAgent).toHaveBeenCalledWith("ok", undefined, true);
		expect(error).toHaveBeenCalled();

		hotReload.broadcastReload.mockImplementation(() => {
			throw new Error("sse down");
		});
		fsCallback("change", "agent.ts");
		await vi.advanceTimersByTimeAsync(300);

		await started.stop();
		error.mockRestore();
		log.mockRestore();
	});

	it("warns when watch() fails and still returns a stop function", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
		watchMock.mockImplementation(() => {
			throw new Error("ENOSPC");
		});
		const started = await startHttpServer({
			...baseConfig,
			hotReload: true,
			watchPaths: ["/nope"],
		});
		expect(warn).toHaveBeenCalledWith(
			expect.stringContaining("Failed to watch"),
		);
		await started.stop();
		warn.mockRestore();
	});

	it("handles session restore failures, null filenames, and reload errors", async () => {
		const error = vi
			.spyOn(console, "error")
			.mockImplementation(() => undefined);
		agentManager.hasInitialStateChanged.mockResolvedValue(false);
		agentManager.getLoadedAgentSessions.mockReturnValue(
			new Map([["agent-a", "sess-1"]]),
		);
		agentManager.startAgent.mockRejectedValue(new Error("restore failed"));
		watchMock.mockReturnValue(new FakeWatcher());

		const started = await startHttpServer({
			...baseConfig,
			quiet: true,
			hotReload: true,
			watchPaths: [process.cwd()],
		});
		const fsCallback = watchMock.mock.calls[0][2] as (
			event: string,
			filename: string | null,
		) => void;
		fsCallback("change", null);
		await vi.advanceTimersByTimeAsync(300);
		await Promise.resolve();

		agentManager.hasInitialStateChanged.mockRejectedValue(
			new Error("scan boom"),
		);
		fsCallback("change", "x.ts");
		await vi.advanceTimersByTimeAsync(300);
		await Promise.resolve();
		expect(error).toHaveBeenCalledWith(
			"[hot-reload] Error during reload:",
			expect.any(Error),
		);

		hotReload.closeAll.mockImplementation(() => {
			throw new Error("closeAll");
		});
		await started.stop();
		error.mockRestore();
	});
});
