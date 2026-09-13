import { afterEach, describe, expect, it, vi } from "vitest";

const startHttpServer = vi.fn();
const createGracefulShutdownHandler = vi.fn(() => vi.fn());

vi.mock("../../http/bootstrap", () => ({
	startHttpServer,
}));

vi.mock("../../utils/graceful-shutdown", () => ({
	createGracefulShutdownHandler,
}));

vi.mock("chalk", () => ({
	default: {
		blue: (s: string) => s,
		green: (s: string) => s,
		cyan: (s: string) => s,
		gray: (s: string) => s,
	},
}));

const { ServeCommand } = await import("../../cli/serve.command");
const { WebCommand } = await import("../../cli/web.command");

describe("ServeCommand.run", () => {
	afterEach(() => {
		vi.clearAllMocks();
		vi.restoreAllMocks();
	});

	it("starts the HTTP server with defaults and keeps process alive", async () => {
		const server = { stop: vi.fn() };
		startHttpServer.mockResolvedValue(server);
		const onSpy = vi.spyOn(process, "on").mockImplementation(() => process);
		vi.spyOn(console, "log").mockImplementation(() => undefined);

		const command = new ServeCommand();
		const runPromise = command.run([], {});

		await vi.waitFor(() => {
			expect(startHttpServer).toHaveBeenCalled();
		});

		expect(startHttpServer).toHaveBeenCalledWith({
			port: 8042,
			host: "localhost",
			agentsDir: process.cwd(),
			quiet: false,
			swagger: undefined,
		});
		expect(createGracefulShutdownHandler).toHaveBeenCalledWith(server, {
			quiet: false,
			name: "server",
		});
		expect(onSpy).toHaveBeenCalledWith("SIGINT", expect.any(Function));
		expect(onSpy).toHaveBeenCalledWith("SIGTERM", expect.any(Function));

		// run() awaits an never-resolving promise; leave it hanging intentionally
		void runPromise;
	});

	it("honors swagger / no-swagger / quiet options", async () => {
		startHttpServer.mockResolvedValue({ stop: vi.fn() });
		vi.spyOn(process, "on").mockImplementation(() => process);
		vi.spyOn(console, "log").mockImplementation(() => undefined);

		const command = new ServeCommand();
		void command.run([], {
			port: 9000,
			host: "0.0.0.0",
			dir: "/agents",
			quiet: true,
			swagger: true,
		});

		await vi.waitFor(() => expect(startHttpServer).toHaveBeenCalled());
		expect(startHttpServer).toHaveBeenCalledWith({
			port: 9000,
			host: "0.0.0.0",
			agentsDir: "/agents",
			quiet: true,
			swagger: true,
		});

		startHttpServer.mockClear();
		void command.run([], { noSwagger: true, quiet: true });
		await vi.waitFor(() => expect(startHttpServer).toHaveBeenCalled());
		expect(startHttpServer.mock.calls[0][0].swagger).toBe(false);
	});
});

describe("WebCommand.run", () => {
	afterEach(() => {
		vi.clearAllMocks();
		vi.restoreAllMocks();
	});

	it("starts quiet API server and prints web URL with custom port", async () => {
		const server = { stop: vi.fn() };
		startHttpServer.mockResolvedValue(server);
		vi.spyOn(process, "on").mockImplementation(() => process);
		const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

		const command = new WebCommand();
		void command.run([], {
			port: 9001,
			host: "127.0.0.1",
			dir: "/agents",
			webUrl: "https://example.test/web",
		});

		await vi.waitFor(() => expect(startHttpServer).toHaveBeenCalled());
		expect(startHttpServer).toHaveBeenCalledWith({
			port: 9001,
			host: "127.0.0.1",
			agentsDir: "/agents",
			quiet: true,
		});
		expect(log.mock.calls.some((c) => String(c[0]).includes("port=9001"))).toBe(
			true,
		);
		expect(createGracefulShutdownHandler).toHaveBeenCalledWith(server, {
			quiet: false,
			name: "API server",
		});
	});

	it("omits port query param for default API port", async () => {
		startHttpServer.mockResolvedValue({ stop: vi.fn() });
		vi.spyOn(process, "on").mockImplementation(() => process);
		const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

		const command = new WebCommand();
		void command.run([], { webUrl: "https://example.test/" });

		await vi.waitFor(() => expect(startHttpServer).toHaveBeenCalled());
		expect(
			log.mock.calls.some(
				(c) =>
					String(c[0]).includes("https://example.test/") &&
					!String(c[0]).includes("port="),
			),
		).toBe(true);
	});
});
