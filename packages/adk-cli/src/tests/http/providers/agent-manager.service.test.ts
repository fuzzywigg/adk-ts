import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { InMemorySessionService } from "@iqai/adk";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Agent } from "../../../common/types";
import { AgentManager } from "../../../http/providers/agent-manager.service";

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

vi.mock("../../../http/providers/agent-manager/sessions", async () => {
	const actual = await vi.importActual<
		typeof import("../../../http/providers/agent-manager/sessions")
	>("../../../http/providers/agent-manager/sessions");
	return {
		...actual,
		createRunnerWithSession: vi.fn(async () => ({
			runAsync: async function* () {
				yield {
					content: {
						parts: [{ text: "hello " }, { text: "world" }, { inlineData: {} }],
					},
				};
			},
		})),
	};
});

describe("AgentManager", () => {
	const dirs: string[] = [];

	afterEach(() => {
		for (const dir of dirs.splice(0)) {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	function makeAgentDir(name = "demo"): {
		root: string;
		agentDir: string;
		agentPath: string;
	} {
		const root = mkdtempSync(join(tmpdir(), "adk-mgr-"));
		dirs.push(root);
		const agentDir = join(root, "agents", name);
		mkdirSync(agentDir, { recursive: true });
		writeFileSync(
			join(agentDir, "agent.ts"),
			`export const agent = { name: "${name}" };`,
		);
		return { root, agentDir, agentPath: `agents/${name}` };
	}

	function stubAgent(
		absolutePath: string,
		projectRoot: string,
		name = "demo",
	): Agent {
		return {
			name,
			absolutePath,
			relativePath: name,
			projectRoot,
		};
	}

	function wireLoader(
		mgr: AgentManager,
		agentResult: { agent: { name: string }; builtAgent?: unknown },
	) {
		const loader = {
			loadEnvironmentVariables: vi.fn(),
			importTypeScriptFile: vi
				.fn()
				.mockResolvedValue({ agent: agentResult.agent }),
			resolveAgentExport: vi.fn().mockResolvedValue(agentResult),
		};
		(mgr as any).loader = loader;
		return loader;
	}

	it("scanAgents replaces the agents map via the scanner", () => {
		const mgr = new AgentManager(new InMemorySessionService(), true);
		const scanned = new Map<string, Agent>([
			["agents/a", stubAgent("/tmp/a", "/tmp", "a")],
		]);
		(mgr as any).scanner = {
			scanAgents: vi.fn().mockReturnValue(scanned),
		};

		mgr.scanAgents("/tmp/agents");

		expect((mgr as any).scanner.scanAgents).toHaveBeenCalledWith(
			"/tmp/agents",
			mgr.getLoadedAgents(),
		);
		expect(mgr.getAgents()).toBe(scanned);
	});

	it("startAgent throws when the agent path is unknown", async () => {
		const mgr = new AgentManager(new InMemorySessionService(), true);
		await expect(mgr.startAgent("missing")).rejects.toThrow(
			"Agent not found: missing",
		);
	});

	it("startAgent is a no-op when the agent is already loaded", async () => {
		const { agentDir, agentPath, root } = makeAgentDir();
		const mgr = new AgentManager(new InMemorySessionService(), true);
		mgr.getAgents().set(agentPath, stubAgent(agentDir, root));
		mgr.getLoadedAgents().set(agentPath, {
			agent: { name: "demo" } as any,
			runner: {} as any,
			sessionId: "s1",
			userId: "u1",
			appName: "adk-server",
		});
		const loader = wireLoader(mgr, { agent: { name: "demo" } });

		await mgr.startAgent(agentPath);

		expect(loader.importTypeScriptFile).not.toHaveBeenCalled();
	});

	it("startAgent wraps missing agent files as clean Failed to load agent errors", async () => {
		const root = mkdtempSync(join(tmpdir(), "adk-mgr-empty-"));
		dirs.push(root);
		const agentDir = join(root, "agents", "empty");
		mkdirSync(agentDir, { recursive: true });
		const agentPath = "agents/empty";
		const mgr = new AgentManager(new InMemorySessionService(), true);
		mgr.getAgents().set(agentPath, stubAgent(agentDir, root, "empty"));

		await expect(mgr.startAgent(agentPath)).rejects.toMatchObject({
			message: expect.stringContaining("Failed to load agent:"),
			stack: undefined,
		});
	});

	it("startAgent rejects invalid exports without a name", async () => {
		const { agentDir, agentPath, root } = makeAgentDir("noname");
		const mgr = new AgentManager(new InMemorySessionService(), true);
		mgr.getAgents().set(agentPath, stubAgent(agentDir, root, "noname"));
		wireLoader(mgr, { agent: { name: "" } });

		await expect(mgr.startAgent(agentPath)).rejects.toThrow(
			/Failed to load agent:.*Invalid agent export/,
		);
	});

	it("startAgent loads an agent and records session metadata", async () => {
		const { agentDir, agentPath, root } = makeAgentDir("ok");
		const sessionService = new InMemorySessionService();
		const mgr = new AgentManager(sessionService, true);
		const agent = stubAgent(agentDir, root, "ok");
		mgr.getAgents().set(agentPath, agent);
		wireLoader(mgr, {
			agent: { name: "ok" },
			builtAgent: { session: { state: { seeded: true } } },
		});

		const result = await mgr.startAgent(agentPath);

		expect(result).toEqual({ session: undefined });
		expect(mgr.getLoadedAgents().has(agentPath)).toBe(true);
		expect(agent.instance).toEqual({ name: "ok" });
		expect(agent.name).toBe("ok");
		expect(mgr.getLoadedAgentSessions().get(agentPath)).toBeTypeOf("string");
		expect(mgr.getInitialStateForAgent(agentPath)).toEqual({ seeded: true });
	});

	it("startAgent clears sessions and ignores preservedSessionId when state changes", async () => {
		const { agentDir, agentPath, root } = makeAgentDir("stateful");
		const sessionService = new InMemorySessionService();
		const mgr = new AgentManager(sessionService, true);
		mgr.getAgents().set(agentPath, stubAgent(agentDir, root, "stateful"));
		wireLoader(mgr, {
			agent: { name: "stateful" },
			builtAgent: { session: { state: { v: 1 } } },
		});

		await mgr.startAgent(agentPath);
		expect(mgr.getLoadedAgents().has(agentPath)).toBe(true);

		await mgr.stopAgent(agentPath);
		wireLoader(mgr, {
			agent: { name: "stateful" },
			builtAgent: { session: { state: { v: 2 } } },
		});

		const preserved = "preserve-me";
		const result = await mgr.startAgent(agentPath, preserved);
		expect(result).toEqual({ session: undefined });
		expect(mgr.getLoadedAgents().has(agentPath)).toBe(true);
	});

	it("stopAgent and stopAllAgents clear loaded agents and instances", async () => {
		const { agentDir, agentPath, root } = makeAgentDir("stop");
		const mgr = new AgentManager(new InMemorySessionService(), true);
		const agent = stubAgent(agentDir, root, "stop");
		mgr.getAgents().set(agentPath, agent);
		wireLoader(mgr, { agent: { name: "stop" } });
		await mgr.startAgent(agentPath);
		expect(agent.instance).toBeDefined();

		await mgr.stopAgent(agentPath);
		expect(mgr.getLoadedAgents().has(agentPath)).toBe(false);
		expect(agent.instance).toBeUndefined();

		wireLoader(mgr, { agent: { name: "stop" } });
		await mgr.startAgent(agentPath);
		mgr.stopAllAgents();
		expect(mgr.getLoadedAgents().size).toBe(0);
	});

	it("sendMessageToAgent auto-starts, accumulates text, and ignores non-text parts", async () => {
		const { agentDir, agentPath, root } = makeAgentDir("chat");
		const mgr = new AgentManager(new InMemorySessionService(), true);
		mgr.getAgents().set(agentPath, stubAgent(agentDir, root, "chat"));
		wireLoader(mgr, { agent: { name: "chat" } });

		const reply = await mgr.sendMessageToAgent(agentPath, "ping", [
			{ name: "a.txt", mimeType: "text/plain", data: "YQ==" },
		]);

		expect(reply).toBe("hello world");
	});

	it("sendMessageToAgent wraps runner errors", async () => {
		const { agentDir, agentPath, root } = makeAgentDir("boom");
		const mgr = new AgentManager(new InMemorySessionService(), true);
		mgr.getAgents().set(agentPath, stubAgent(agentDir, root, "boom"));
		wireLoader(mgr, { agent: { name: "boom" } });
		await mgr.startAgent(agentPath);
		mgr.getLoadedAgents().set(agentPath, {
			agent: { name: "boom" } as any,
			runner: {
				runAsync: () => ({
					[Symbol.asyncIterator]() {
						return {
							next: () => Promise.reject(new Error("runner failed")),
						};
					},
				}),
			} as any,
			sessionId: "s1",
			userId: "u1",
			appName: "adk-server",
		});

		await expect(mgr.sendMessageToAgent(agentPath, "x")).rejects.toThrow(
			"Failed to send message to agent: runner failed",
		);
	});

	it("getInitialStateForAgent returns undefined when agent or instance is missing", () => {
		const mgr = new AgentManager(new InMemorySessionService(), true);
		expect(mgr.getInitialStateForAgent("missing")).toBeUndefined();
		mgr.getAgents().set("agents/x", stubAgent("/tmp/x", "/tmp", "x"));
		expect(mgr.getInitialStateForAgent("agents/x")).toBeUndefined();
	});

	it("hasInitialStateChanged detects hash mismatches and load failures", async () => {
		const { agentDir, agentPath, root } = makeAgentDir("detect");
		const mgr = new AgentManager(new InMemorySessionService(), true);
		mgr.getAgents().set(agentPath, stubAgent(agentDir, root, "detect"));
		wireLoader(mgr, {
			agent: { name: "detect" },
			builtAgent: { session: { state: { v: 1 } } },
		});
		await mgr.startAgent(agentPath);

		expect(await mgr.hasInitialStateChanged()).toBe(false);

		wireLoader(mgr, {
			agent: { name: "detect" },
			builtAgent: { session: { state: { v: 99 } } },
		});
		expect(await mgr.hasInitialStateChanged()).toBe(true);

		const failing = wireLoader(mgr, { agent: { name: "detect" } });
		failing.importTypeScriptFile.mockRejectedValue(new Error("reload boom"));
		expect(await mgr.hasInitialStateChanged()).toBe(true);
	});
});
