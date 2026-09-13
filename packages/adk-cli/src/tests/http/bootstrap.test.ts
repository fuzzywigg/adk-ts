import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
	mockCreate,
	mockSetup,
	mockCreateDocument,
	mockScanAgents,
	mockStopAllAgents,
	mockCloseAll,
	mockListen,
	mockClose,
	mockEnableCors,
	mockUseBodyParser,
	mockUseGlobalFilters,
	mockGet,
} = vi.hoisted(() => {
	const mockScanAgents = vi.fn();
	const mockStopAllAgents = vi.fn();
	const mockCloseAll = vi.fn();
	const mockListen = vi.fn().mockResolvedValue(undefined);
	const mockClose = vi.fn().mockResolvedValue(undefined);
	const mockEnableCors = vi.fn();
	const mockUseBodyParser = vi.fn();
	const mockUseGlobalFilters = vi.fn();
	const mockGet = vi.fn();
	const mockCreate = vi.fn();
	const mockSetup = vi.fn();
	const mockCreateDocument = vi.fn().mockReturnValue({ openapi: "3.0.0" });

	return {
		mockCreate,
		mockSetup,
		mockCreateDocument,
		mockScanAgents,
		mockStopAllAgents,
		mockCloseAll,
		mockListen,
		mockClose,
		mockEnableCors,
		mockUseBodyParser,
		mockUseGlobalFilters,
		mockGet,
	};
});

vi.mock("@nestjs/core", () => ({
	NestFactory: {
		create: (...args: unknown[]) => mockCreate(...args),
	},
}));

vi.mock("@nestjs/swagger", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@nestjs/swagger")>();
	return {
		...actual,
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
				return { info: { title: "ADK HTTP API" } };
			}
		},
		SwaggerModule: {
			createDocument: (...args: unknown[]) => mockCreateDocument(...args),
			setup: (...args: unknown[]) => mockSetup(...args),
		},
	};
});

vi.mock("node:fs", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:fs")>();
	return {
		...actual,
		watch: vi.fn(() => ({ close: vi.fn() })),
		existsSync: vi.fn(() => false),
		readFileSync: vi.fn(() => ""),
	};
});

import { watch } from "node:fs";
import { startHttpServer } from "../../http/bootstrap";
import { AgentManager } from "../../http/providers/agent-manager.service";
import { HotReloadService } from "../../http/reload/hot-reload.service";

describe("startHttpServer", () => {
	const originalEnv = { ...process.env };

	beforeEach(() => {
		vi.clearAllMocks();
		process.env = {
			...originalEnv,
			NODE_ENV: "development",
			ADK_DEBUG: "false",
			ADK_HTTP_BODY_LIMIT: "12mb",
		};

		mockCreateDocument.mockReturnValue({ openapi: "3.0.0" });
		mockListen.mockResolvedValue(undefined);
		mockClose.mockResolvedValue(undefined);

		mockGet.mockImplementation((token: unknown) => {
			if (token === AgentManager) {
				return {
					scanAgents: mockScanAgents,
					stopAllAgents: mockStopAllAgents,
					getAgents: () => new Map(),
					getLoadedAgentSessions: () => new Map(),
					hasInitialStateChanged: async () => false,
					startAgent: vi.fn(),
				};
			}
			if (token === HotReloadService) {
				return {
					broadcastReload: vi.fn(),
					closeAll: mockCloseAll,
				};
			}
			return undefined;
		});

		mockCreate.mockResolvedValue({
			useGlobalFilters: mockUseGlobalFilters,
			enableCors: mockEnableCors,
			useBodyParser: mockUseBodyParser,
			get: mockGet,
			listen: mockListen,
			close: mockClose,
		});
	});

	afterEach(() => {
		process.env = originalEnv;
	});

	it("creates the Nest app, scans agents, listens, and returns stop()", async () => {
		const server = await startHttpServer({
			port: 8042,
			host: "localhost",
			agentsDir: "/tmp/agents",
			quiet: true,
			hotReload: false,
			swagger: false,
		});

		expect(mockCreate).toHaveBeenCalled();
		expect(mockEnableCors).toHaveBeenCalledWith(
			expect.objectContaining({
				origin: true,
				methods: expect.arrayContaining(["GET", "POST"]),
			}),
		);
		expect(mockUseBodyParser).toHaveBeenCalledWith("json", { limit: "12mb" });
		expect(mockUseBodyParser).toHaveBeenCalledWith(
			"urlencoded",
			expect.objectContaining({ limit: "12mb", extended: true }),
		);
		expect(mockScanAgents).toHaveBeenCalledWith("/tmp/agents");
		expect(mockListen).toHaveBeenCalledWith(8042, "localhost");
		expect(server.url).toBe("http://localhost:8042");

		await server.stop();
		expect(mockStopAllAgents).toHaveBeenCalled();
		expect(mockClose).toHaveBeenCalled();
	});

	it("enables debug logger levels when ADK_DEBUG=true", async () => {
		process.env.ADK_DEBUG = "true";

		await startHttpServer({
			port: 1,
			host: "127.0.0.1",
			agentsDir: "/agents",
			quiet: true,
			hotReload: false,
			swagger: false,
		});

		expect(mockCreate).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				logger: ["log", "error", "warn", "debug", "verbose"],
			}),
		);
	});

	it("sets up swagger docs when swagger is enabled", async () => {
		await startHttpServer({
			port: 8042,
			host: "localhost",
			agentsDir: "/agents",
			quiet: true,
			hotReload: false,
			swagger: true,
		});

		expect(mockCreateDocument).toHaveBeenCalled();
		expect(mockSetup).toHaveBeenCalledWith(
			"docs",
			expect.anything(),
			expect.anything(),
			expect.objectContaining({
				customSiteTitle: "ADK API Docs",
				jsonDocumentUrl: "/openapi.json",
			}),
		);
	});

	it("skips swagger setup when swagger is false", async () => {
		await startHttpServer({
			port: 8042,
			host: "localhost",
			agentsDir: "/agents",
			quiet: true,
			hotReload: false,
			swagger: false,
		});

		expect(mockSetup).not.toHaveBeenCalled();
	});

	it("registers hot-reload watchers when hotReload is true", async () => {
		const server = await startHttpServer({
			port: 8042,
			host: "localhost",
			agentsDir: "/agents",
			quiet: true,
			hotReload: true,
			swagger: false,
			watchPaths: ["/tmp/watch-me"],
		});

		expect(watch).toHaveBeenCalledWith(
			expect.stringContaining("watch-me"),
			expect.objectContaining({ recursive: true }),
			expect.any(Function),
		);

		await server.stop();
		expect(mockCloseAll).toHaveBeenCalled();
	});

	it("does not register watchers when hotReload is false", async () => {
		await startHttpServer({
			port: 8042,
			host: "localhost",
			agentsDir: "/agents",
			quiet: true,
			hotReload: false,
			swagger: false,
		});

		expect(watch).not.toHaveBeenCalled();
	});

	it("applies the PrettyErrorFilter globally", async () => {
		await startHttpServer({
			port: 8042,
			host: "localhost",
			agentsDir: "/agents",
			quiet: true,
			hotReload: false,
			swagger: false,
		});

		expect(mockUseGlobalFilters).toHaveBeenCalledWith(expect.any(Object));
	});
});
