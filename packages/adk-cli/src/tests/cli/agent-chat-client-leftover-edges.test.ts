import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentChatClient, ConsoleManager } from "../../cli/run.command";

const selectMock = vi.hoisted(() => vi.fn());
const textMock = vi.hoisted(() => vi.fn());
const spinnerMock = vi.hoisted(() => vi.fn());
const isCancelMock = vi.hoisted(() => vi.fn());
const outroMock = vi.hoisted(() => vi.fn());

vi.mock("@clack/prompts", () => ({
	select: selectMock,
	text: textMock,
	spinner: spinnerMock,
	isCancel: isCancelMock,
	outro: outroMock,
	intro: vi.fn(),
}));

describe("AgentChatClient leftover edges (TOKENMAXX adk-cli)", () => {
	let consoleManager: ConsoleManager;
	let client: AgentChatClient;
	const fetchMock = vi.fn();

	beforeEach(() => {
		vi.clearAllMocks();
		consoleManager = new ConsoleManager(true);
		client = new AgentChatClient("http://localhost:8042", consoleManager);
		vi.stubGlobal("fetch", fetchMock);
		spinnerMock.mockReturnValue({
			start: vi.fn(),
			stop: vi.fn(),
		});
		isCancelMock.mockReturnValue(false);
	});

	afterEach(() => {
		consoleManager.restore();
		vi.unstubAllGlobals();
	});

	it("sendMessage throws when the selected agent has no relativePath", async () => {
		client.setSelectedAgent({
			name: "demo",
			relativePath: "",
			absolutePath: "/demo",
		});
		await expect(client.sendMessage("hi")).rejects.toThrow(
			/agent path not available/,
		);
	});

	it("sendMessage prints without agentName and skips empty responses", async () => {
		const printSpy = vi.spyOn(consoleManager, "printAnswer");
		const spinner = { start: vi.fn(), stop: vi.fn() };
		spinnerMock.mockReturnValue(spinner);
		client.setSelectedAgent({
			name: "demo",
			relativePath: "demo",
			absolutePath: "/demo",
		});
		fetchMock.mockResolvedValue({
			ok: true,
			json: async () => ({}),
		});

		await client.sendMessage("hi");
		expect(spinner.stop).toHaveBeenCalledWith("🤖 Assistant:");
		expect(printSpy).not.toHaveBeenCalled();
	});

	it("sendMessage JSON errors without error+message fall through to raw text", async () => {
		client.setSelectedAgent({
			name: "demo",
			relativePath: "demo",
			absolutePath: "/demo",
		});
		fetchMock.mockResolvedValue({
			ok: false,
			text: async () => JSON.stringify({ reason: "nope" }),
		});
		await expect(client.sendMessage("hi")).rejects.toThrow(/nope/);
	});

	it("sendMessage formats JSON errors without a details array", async () => {
		const errorSpy = vi.spyOn(consoleManager, "error");
		client.setSelectedAgent({
			name: "demo",
			relativePath: "demo",
			absolutePath: "/demo",
		});
		fetchMock.mockResolvedValue({
			ok: false,
			text: async () =>
				JSON.stringify({
					error: "Denied",
					message: "not allowed",
				}),
		});
		await expect(client.sendMessage("hi")).rejects.toThrow(
			/Denied|not allowed/,
		);
		expect(errorSpy).toHaveBeenCalled();
	});

	it("startChat treats cancelled prompts as exit and ignores blank lines", async () => {
		client.setSelectedAgent({
			name: "demo",
			relativePath: "demo",
			absolutePath: "/demo",
		});
		isCancelMock.mockReturnValueOnce(false).mockReturnValueOnce(true);
		textMock
			.mockResolvedValueOnce("   ")
			.mockResolvedValueOnce(Symbol("cancel"));
		const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
			throw new Error("process.exit");
		}) as never);

		await expect(client.startChat()).rejects.toThrow("process.exit");
		expect(exitSpy).toHaveBeenCalledWith(0);
		exitSpy.mockRestore();
	});

	it("startChat stringifies symbol input and exits on send failures", async () => {
		client.setSelectedAgent({
			name: "demo",
			relativePath: "demo",
			absolutePath: "/demo",
		});
		textMock.mockResolvedValueOnce(Symbol("msg")).mockResolvedValue("hi");
		fetchMock.mockRejectedValue(new Error("offline"));
		const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
			throw new Error("process.exit");
		}) as never);

		await expect(client.startChat()).rejects.toThrow("process.exit");
		expect(exitSpy).toHaveBeenCalledWith(1);
		exitSpy.mockRestore();
	});

	it("startChat SIGINT handler ends the chat", async () => {
		client.setSelectedAgent({
			name: "demo",
			relativePath: "demo",
			absolutePath: "/demo",
		});
		textMock.mockImplementation(
			() =>
				new Promise(() => {
					/* hang until SIGINT */
				}),
		);
		const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
			throw new Error("process.exit");
		}) as never);

		void client.startChat();
		await vi.waitFor(() => {
			expect(process.listenerCount("SIGINT")).toBeGreaterThan(0);
		});
		expect(() => process.emit("SIGINT")).toThrow("process.exit");
		expect(outroMock).toHaveBeenCalled();
		expect(exitSpy).toHaveBeenCalledWith(0);
		exitSpy.mockRestore();
	});
});
