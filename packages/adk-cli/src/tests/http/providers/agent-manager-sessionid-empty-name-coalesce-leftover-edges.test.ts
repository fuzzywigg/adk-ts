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
				yield { content: { parts: [{ text: "ok" }] } };
			},
		})),
		getExistingSession: vi.fn(async () => {
			throw new Error("getExistingSession should not be called");
		}),
	};
});

/**
 * Leftover: preservedSessionId "" is falsy (&&); name 0 fails validation;
 * attachments undefined uses || []; empty registry name kept by ?? in catch.
 */
describe("AgentManager sessionId empty / name coalesce leftover edges", () => {
	const dirs: string[] = [];

	afterEach(() => {
		for (const dir of dirs.splice(0)) {
			rmSync(dir, { recursive: true, force: true });
		}
		vi.clearAllMocks();
	});

	function makeAgentDir(name = "demo") {
		const root = mkdtempSync(join(tmpdir(), "adk-mgr-leftover-"));
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
		agentResult: { agent: { name: unknown }; builtAgent?: unknown },
	) {
		const loader = {
			loadEnvironmentVariables: vi.fn(),
			importTypeScriptFile: vi
				.fn()
				.mockResolvedValue({ agent: agentResult.agent }),
			resolveAgentExport: vi.fn().mockResolvedValue(agentResult),
		};
		(mgr as never as { loader: unknown }).loader = loader;
		return loader;
	}

	it("preservedSessionId empty string does not call getExistingSession", async () => {
		const { agentDir, agentPath, root } = makeAgentDir("empty-sid");
		const mgr = new AgentManager(new InMemorySessionService(), true);
		mgr.getAgents().set(agentPath, stubAgent(agentDir, root, "empty-sid"));
		wireLoader(mgr, { agent: { name: "empty-sid" } });

		const { getExistingSession } = await import(
			"../../../http/providers/agent-manager/sessions"
		);

		await mgr.startAgent(agentPath, "");
		expect(getExistingSession).not.toHaveBeenCalled();
		expect(mgr.getLoadedAgents().has(agentPath)).toBe(true);
	});

	it("rejects agent.name 0 as invalid export (!name)", async () => {
		const { agentDir, agentPath, root } = makeAgentDir("numname");
		const mgr = new AgentManager(new InMemorySessionService(), true);
		mgr.getAgents().set(agentPath, stubAgent(agentDir, root, "numname"));
		wireLoader(mgr, { agent: { name: 0 } });

		await expect(mgr.startAgent(agentPath)).rejects.toThrow(
			/Invalid agent export/,
		);
	});

	it("sendMessageToAgent tolerates undefined attachments via || []", async () => {
		const { agentDir, agentPath, root } = makeAgentDir("atts");
		const mgr = new AgentManager(new InMemorySessionService(), true);
		mgr.getAgents().set(agentPath, stubAgent(agentDir, root, "atts"));
		wireLoader(mgr, { agent: { name: "atts" } });

		await expect(mgr.sendMessageToAgent(agentPath, "ping")).resolves.toBe("ok");
	});

	it("catch path keeps empty agent.name via ?? (does not substitute path)", async () => {
		const { agentDir, agentPath, root } = makeAgentDir("catchname");
		const mgr = new AgentManager(new InMemorySessionService(), true);
		const agent = stubAgent(agentDir, root, "");
		mgr.getAgents().set(agentPath, agent);
		const loader = wireLoader(mgr, { agent: { name: "catchname" } });
		loader.importTypeScriptFile.mockRejectedValue(new Error("boom"));

		await expect(mgr.startAgent(agentPath)).rejects.toThrow(
			/Failed to load agent:/,
		);
	});
});
