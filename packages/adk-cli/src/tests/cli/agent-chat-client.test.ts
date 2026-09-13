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

describe("AgentChatClient", () => {
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

	it("connect succeeds on healthy response", async () => {
		fetchMock.mockResolvedValue({ ok: true });
		await expect(client.connect()).resolves.toBeUndefined();
	});

	it("connect throws when health check fails", async () => {
		fetchMock.mockResolvedValue({ ok: false });
		await expect(client.connect()).rejects.toThrow(/Connection failed/);
	});

	it("connect throws when fetch rejects", async () => {
		fetchMock.mockRejectedValue(new Error("offline"));
		await expect(client.connect()).rejects.toThrow(/Connection failed/);
	});

	it("fetchAgents returns array payloads and agents-wrapped payloads", async () => {
		fetchMock.mockResolvedValueOnce({
			ok: true,
			json: async () => [{ name: "a", relativePath: "a", absolutePath: "/a" }],
		});
		await expect(client.fetchAgents()).resolves.toEqual([
			expect.objectContaining({ name: "a" }),
		]);

		fetchMock.mockResolvedValueOnce({
			ok: true,
			json: async () => ({
				agents: [{ name: "b", relativePath: "b", absolutePath: "/b" }],
			}),
		});
		await expect(client.fetchAgents()).resolves.toEqual([
			expect.objectContaining({ name: "b" }),
		]);
	});

	it("fetchAgents throws on http and unexpected shapes", async () => {
		fetchMock.mockResolvedValueOnce({
			ok: false,
			status: 500,
			statusText: "ERR",
		});
		await expect(client.fetchAgents()).rejects.toThrow(
			/Failed to fetch agents/,
		);

		fetchMock.mockResolvedValueOnce({
			ok: true,
			json: async () => ({ unexpected: true }),
		});
		await expect(client.fetchAgents()).rejects.toThrow(/Unexpected response/);
	});

	it("selectAgent returns the only agent without prompting", async () => {
		fetchMock.mockResolvedValue({
			ok: true,
			json: async () => [
				{ name: "solo", relativePath: "solo", absolutePath: "/solo" },
			],
		});
		await expect(client.selectAgent()).resolves.toEqual(
			expect.objectContaining({ name: "solo" }),
		);
		expect(selectMock).not.toHaveBeenCalled();
	});

	it("selectAgent throws when no agents exist", async () => {
		fetchMock.mockResolvedValue({
			ok: true,
			json: async () => [],
		});
		await expect(client.selectAgent()).rejects.toThrow(/No agents found/);
	});

	it("selectAgent prompts when multiple agents exist", async () => {
		const agents = [
			{ name: "one", relativePath: "one", absolutePath: "/one" },
			{ name: "two", relativePath: "two", absolutePath: "/two" },
		];
		fetchMock.mockResolvedValue({
			ok: true,
			json: async () => agents,
		});
		selectMock.mockResolvedValue(agents[1]);

		await expect(client.selectAgent()).resolves.toEqual(agents[1]);
		expect(selectMock).toHaveBeenCalled();
	});

	it("selectAgent exits when prompt is cancelled", async () => {
		const agents = [
			{ name: "one", relativePath: "one", absolutePath: "/one" },
			{ name: "two", relativePath: "two", absolutePath: "/two" },
		];
		fetchMock.mockResolvedValue({
			ok: true,
			json: async () => agents,
		});
		isCancelMock.mockReturnValue(true);
		selectMock.mockResolvedValue(Symbol("cancel"));
		const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
			throw new Error("process.exit");
		}) as never);

		await expect(client.selectAgent()).rejects.toThrow("process.exit");
		expect(exitSpy).toHaveBeenCalledWith(0);
		exitSpy.mockRestore();
	});

	it("sendMessage requires a selected agent", async () => {
		await expect(client.sendMessage("hi")).rejects.toThrow(/No agent selected/);
	});

	it("sendMessage posts and prints successful answers", async () => {
		const printSpy = vi.spyOn(consoleManager, "printAnswer");
		client.setSelectedAgent({
			name: "demo",
			relativePath: "demo/agent",
			absolutePath: "/demo/agent",
		});
		fetchMock.mockResolvedValue({
			ok: true,
			json: async () => ({ response: "hello", agentName: "demo" }),
		});

		await client.sendMessage("hi");
		expect(fetchMock).toHaveBeenCalledWith(
			expect.stringContaining("/api/agents/demo%2Fagent/message"),
			expect.objectContaining({ method: "POST" }),
		);
		expect(printSpy).toHaveBeenCalledWith("hello");
	});

	it("sendMessage formats structured JSON errors", async () => {
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
					error: "Boom",
					message: "bad request",
					details: ["a", "b"],
				}),
		});

		await expect(client.sendMessage("hi")).rejects.toThrow(/Boom/);
		expect(errorSpy).toHaveBeenCalled();
	});

	it("sendMessage falls back to raw error text", async () => {
		client.setSelectedAgent({
			name: "demo",
			relativePath: "demo",
			absolutePath: "/demo",
		});
		fetchMock.mockResolvedValue({
			ok: false,
			text: async () => "plain failure",
		});

		await expect(client.sendMessage("hi")).rejects.toThrow(/plain failure/);
	});

	it("startChat exits on quit and rejects when agent is missing", async () => {
		await expect(client.startChat()).rejects.toThrow(/Agent not selected/);

		client.setSelectedAgent({
			name: "demo",
			relativePath: "demo",
			absolutePath: "/demo",
		});
		textMock.mockResolvedValue("quit");
		const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
			throw new Error("process.exit");
		}) as never);

		await expect(client.startChat()).rejects.toThrow("process.exit");
		expect(exitSpy).toHaveBeenCalledWith(0);
		exitSpy.mockRestore();
	});
});
