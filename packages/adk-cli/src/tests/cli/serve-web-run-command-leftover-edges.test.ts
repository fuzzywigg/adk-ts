import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { startHttpServerMock, createGracefulShutdownHandlerMock } = vi.hoisted(
	() => ({
		startHttpServerMock: vi.fn(),
		createGracefulShutdownHandlerMock: vi.fn(),
	}),
);

vi.mock("../../http/bootstrap", () => ({
	startHttpServer: (...args: unknown[]) => startHttpServerMock(...args),
}));

vi.mock("../../utils/graceful-shutdown", () => ({
	createGracefulShutdownHandler: (...args: unknown[]) =>
		createGracefulShutdownHandlerMock(...args),
}));

const introMock = vi.hoisted(() => vi.fn());
const outroMock = vi.hoisted(() => vi.fn());
const selectMock = vi.hoisted(() => vi.fn());
const isCancelMock = vi.hoisted(() => vi.fn());

vi.mock("@clack/prompts", async () => {
	const actual =
		await vi.importActual<typeof import("@clack/prompts")>("@clack/prompts");
	return {
		...actual,
		intro: introMock,
		outro: outroMock,
		select: selectMock,
		isCancel: isCancelMock,
	};
});

import { RunCommand } from "../../cli/run.command";
import { ServeCommand } from "../../cli/serve.command";
import { WebCommand } from "../../cli/web.command";

function mockProcessOn() {
	return vi.spyOn(process, "on").mockImplementation((() => process) as never);
}

describe("serve/web/run command leftover edges (TOKENMAXX adk-cli)", () => {
	const originalVerbose = process.env.ADK_VERBOSE;
	const originalNodeEnv = process.env.NODE_ENV;
	let logSpy: any;
	let exitSpy: any;

	beforeEach(() => {
		vi.clearAllMocks();
		process.env.NODE_ENV = "development";
		startHttpServerMock.mockResolvedValue({
			stop: vi.fn().mockResolvedValue(undefined),
		});
		createGracefulShutdownHandlerMock.mockReturnValue(vi.fn());
		logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
		exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
			throw new Error("process.exit");
		}) as never);
		isCancelMock.mockReturnValue(false);
	});

	afterEach(() => {
		if (originalNodeEnv === undefined) {
			delete process.env.NODE_ENV;
		} else {
			process.env.NODE_ENV = originalNodeEnv;
		}
		if (originalVerbose === undefined) {
			delete process.env.ADK_VERBOSE;
		} else {
			process.env.ADK_VERBOSE = originalVerbose;
		}
		logSpy.mockRestore();
		exitSpy.mockRestore();
		vi.restoreAllMocks();
	});

	it("ServeCommand.run starts the server with swagger true, defaults, and quiet banners", async () => {
		const onSpy = mockProcessOn();
		const command = new ServeCommand();
		void command.run([], { swagger: true, quiet: false });
		await vi.waitFor(() => {
			expect(startHttpServerMock).toHaveBeenCalled();
		});

		expect(startHttpServerMock).toHaveBeenCalledWith({
			port: 8042,
			host: "localhost",
			agentsDir: process.cwd(),
			quiet: false,
			swagger: true,
		});
		expect(createGracefulShutdownHandlerMock).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({ quiet: false, name: "server" }),
		);
		expect(onSpy).toHaveBeenCalledWith("SIGINT", expect.any(Function));
		expect(onSpy).toHaveBeenCalledWith("SIGTERM", expect.any(Function));
		expect(
			logSpy.mock.calls.some((c: unknown[]) =>
				String(c[0]).includes("starting"),
			),
		).toBe(true);
	});

	it("ServeCommand.run honors noSwagger, quiet, and custom host/port/dir", async () => {
		mockProcessOn();
		const command = new ServeCommand();
		void command.run([], {
			port: 9001,
			host: "127.0.0.1",
			dir: "/tmp/agents-leftover",
			quiet: true,
			noSwagger: true,
		});
		await vi.waitFor(() => {
			expect(startHttpServerMock).toHaveBeenCalled();
		});

		expect(startHttpServerMock).toHaveBeenCalledWith({
			port: 9001,
			host: "127.0.0.1",
			agentsDir: "/tmp/agents-leftover",
			quiet: true,
			swagger: false,
		});
		expect(logSpy).not.toHaveBeenCalled();
	});

	it("WebCommand.run appends port query only when the API port is not 8042", async () => {
		mockProcessOn();
		const command = new WebCommand();
		void command.run([], {
			port: 9002,
			host: "127.0.0.1",
			dir: "/tmp/web-agents",
			webUrl: "https://adk-web.example.test/",
		});
		await vi.waitFor(() => {
			expect(startHttpServerMock).toHaveBeenCalled();
		});

		expect(startHttpServerMock).toHaveBeenCalledWith({
			port: 9002,
			host: "127.0.0.1",
			agentsDir: "/tmp/web-agents",
			quiet: true,
		});
		expect(
			logSpy.mock.calls.some((c: unknown[]) =>
				String(c[0]).includes("https://adk-web.example.test/?port=9002"),
			),
		).toBe(true);
		expect(createGracefulShutdownHandlerMock).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({ quiet: false, name: "API server" }),
		);
	});

	it("WebCommand.run uses default port/host/dir/webUrl without a port query", async () => {
		mockProcessOn();
		const command = new WebCommand();
		void command.run([]);
		await vi.waitFor(() => {
			expect(startHttpServerMock).toHaveBeenCalled();
		});

		expect(startHttpServerMock).toHaveBeenCalledWith({
			port: 8042,
			host: "localhost",
			agentsDir: process.cwd(),
			quiet: true,
		});
		expect(
			logSpy.mock.calls.some((c: unknown[]) =>
				String(c[0]).includes("https://adk-web.iqai.com/"),
			),
		).toBe(true);
		expect(
			logSpy.mock.calls.some((c: unknown[]) => String(c[0]).includes("?port=")),
		).toBe(false);
	});

	it("RunCommand --server starts HTTP only and registers SIGINT stop", async () => {
		const stop = vi.fn().mockResolvedValue(undefined);
		startHttpServerMock.mockResolvedValue({ stop });
		const onSpy = mockProcessOn();
		delete process.env.ADK_VERBOSE;

		const command = new RunCommand();
		void command.run([], { server: true, host: "127.0.0.1", hot: true });
		await vi.waitFor(() => {
			expect(startHttpServerMock).toHaveBeenCalled();
		});

		expect(startHttpServerMock).toHaveBeenCalledWith({
			port: 8042,
			host: "127.0.0.1",
			agentsDir: process.cwd(),
			quiet: true,
			hotReload: true,
			watchPaths: undefined,
		});

		const sigint = [...onSpy.mock.calls]
			.reverse()
			.find((c) => c[0] === "SIGINT")?.[1] as (() => Promise<void>) | undefined;
		expect(sigint).toBeTypeOf("function");
		await expect(sigint?.()).rejects.toThrow("process.exit");
		expect(stop).toHaveBeenCalled();
		expect(exitSpy).toHaveBeenCalledWith(0);
	});

	it("RunCommand --server verbose logs banners and skips console hooks", async () => {
		mockProcessOn();
		const command = new RunCommand();
		void command.run([], { server: true, verbose: true, watch: ["src"] });
		await vi.waitFor(() => {
			expect(startHttpServerMock).toHaveBeenCalled();
		});
		expect(startHttpServerMock).toHaveBeenCalledWith(
			expect.objectContaining({
				quiet: false,
				watchPaths: ["src"],
			}),
		);
		expect(
			logSpy.mock.calls.some((c: unknown[]) =>
				String(c[0]).includes("Starting"),
			),
		).toBe(true);
	});

	it("RunCommand chat mode starts a local server when health fails then chats", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		fetchMock.mockResolvedValueOnce({ ok: false }).mockResolvedValue({
			ok: true,
			json: async () => [
				{ name: "solo", relativePath: "solo", absolutePath: "/solo" },
			],
		});

		const { AgentChatClient } = await import("../../cli/run.command");
		vi.spyOn(AgentChatClient.prototype, "startChat").mockResolvedValue(
			undefined,
		);

		const command = new RunCommand();
		await command.run(["solo"], { verbose: true, host: "localhost" });

		expect(startHttpServerMock).toHaveBeenCalled();
		expect(outroMock).toHaveBeenCalled();
		vi.unstubAllGlobals();
	});

	it("RunCommand chat mode selects among agents and exits when cancelled", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		fetchMock.mockResolvedValue({
			ok: true,
			json: async () => [
				{ name: "one", relativePath: "one", absolutePath: "/one" },
				{ name: "two", relativePath: "two", absolutePath: "/two" },
			],
		});
		isCancelMock.mockReturnValue(true);
		selectMock.mockResolvedValue(Symbol("cancel"));

		const command = new RunCommand();
		await expect(command.run([], { verbose: true })).rejects.toThrow(
			"process.exit",
		);
		expect(exitSpy).toHaveBeenCalledWith(0);
		vi.unstubAllGlobals();
	});

	it("RunCommand chat mode exits when no agents exist", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		fetchMock.mockResolvedValue({
			ok: true,
			json: async () => [],
		});

		const command = new RunCommand();
		await expect(command.run([], { verbose: true })).rejects.toThrow(
			"process.exit",
		);
		expect(exitSpy).toHaveBeenCalledWith(1);
		vi.unstubAllGlobals();
	});

	it("RunCommand chat mode reports connect failures", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		fetchMock.mockResolvedValue({ ok: false });

		startHttpServerMock.mockResolvedValue({
			stop: vi.fn().mockResolvedValue(undefined),
		});

		const command = new RunCommand();
		await expect(command.run([], { verbose: true })).rejects.toThrow(
			"process.exit",
		);
		expect(exitSpy).toHaveBeenCalledWith(1);
		vi.unstubAllGlobals();
	});
});
