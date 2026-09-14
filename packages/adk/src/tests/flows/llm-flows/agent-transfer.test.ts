import { describe, expect, it } from "vitest";
import { BaseAgent } from "../../../agents/base-agent";
import type { InvocationContext } from "../../../agents/invocation-context";
import { requestProcessor } from "../../../flows/llm-flows/agent-transfer";
import { LlmRequest } from "../../../models/llm-request";
import { PluginManager } from "../../../plugins/plugin-manager";

class StubAgent extends BaseAgent {
	constructor(name: string, description = "") {
		super({ name, description });
	}
}

function makeContext(agent: BaseAgent): InvocationContext {
	return {
		agent,
		invocationId: "e-transfer",
		session: {
			id: "s1",
			appName: "app",
			userId: "u1",
			state: {},
			events: [],
			lastUpdateTime: 0,
		},
		pluginManager: new PluginManager(),
	} as unknown as InvocationContext;
}

describe("AgentTransferLlmRequestProcessor", () => {
	it("skips agents without subAgents", async () => {
		const request = new LlmRequest();
		const context = { agent: { name: "plain" } } as InvocationContext;

		for await (const _ of requestProcessor.runAsync(context, request)) {
		}

		expect(request.config?.systemInstruction).toBeUndefined();
	});

	it("skips when there are no transfer targets", async () => {
		const request = new LlmRequest();
		const agent = new StubAgent("solo");

		for await (const _ of requestProcessor.runAsync(
			makeContext(agent),
			request,
		)) {
		}

		expect(request.config?.systemInstruction).toBeUndefined();
	});

	it("adds transfer instructions for sub-agents", async () => {
		const request = new LlmRequest();
		const child = new StubAgent("worker", "Does work");
		const agent = new StubAgent("orchestrator", "Routes work");
		agent.subAgents = [child];
		child.parentAgent = agent;

		for await (const _ of requestProcessor.runAsync(
			makeContext(agent),
			request,
		)) {
		}

		expect(request.config?.systemInstruction).toContain("transfer_to_agent");
		expect(request.config?.systemInstruction).toContain("worker");
		expect(request.config?.systemInstruction).toContain("Does work");
	});

	it("mentions parent when transfer to parent is allowed", async () => {
		const request = new LlmRequest();
		const parent = new StubAgent("parent", "Parent agent");
		const peer = new StubAgent("peer", "Peer agent");
		const agent = new StubAgent("child", "Child agent");
		parent.subAgents = [agent, peer];
		agent.parentAgent = parent;
		peer.parentAgent = parent;
		agent.subAgents = [new StubAgent("leaf", "Leaf")];

		for await (const _ of requestProcessor.runAsync(
			makeContext(agent),
			request,
		)) {
		}

		expect(request.config?.systemInstruction).toContain("parent");
		expect(request.config?.systemInstruction).toContain("peer");
		expect(request.config?.systemInstruction).toContain("leaf");
	});

	it("honors disallowTransferToParent and disallowTransferToPeers", async () => {
		const request = new LlmRequest();
		const parent = new StubAgent("parent", "Parent agent");
		const peer = new StubAgent("peer", "Peer agent");
		const agent = new StubAgent("child", "Child agent");
		(agent as any).disallowTransferToParent = true;
		(agent as any).disallowTransferToPeers = true;
		parent.subAgents = [agent, peer];
		agent.parentAgent = parent;
		peer.parentAgent = parent;
		agent.subAgents = [new StubAgent("leaf", "Leaf only")];

		for await (const _ of requestProcessor.runAsync(
			makeContext(agent),
			request,
		)) {
		}

		expect(request.config?.systemInstruction).toContain("leaf");
		expect(request.config?.systemInstruction).not.toContain(
			"Your parent agent is parent",
		);
		expect(request.config?.systemInstruction).not.toContain("Peer agent");
	});

	it("registers transfer_to_agent in toolsDict and function declarations", async () => {
		const request = new LlmRequest();
		const child = new StubAgent("worker", "Does work");
		const agent = new StubAgent("orchestrator", "Routes work");
		agent.subAgents = [child];
		child.parentAgent = agent;

		for await (const _ of requestProcessor.runAsync(
			makeContext(agent),
			request,
		)) {
		}

		expect(request.toolsDict.transfer_to_agent).toBeDefined();
		expect(request.toolsDict.transfer_to_agent.name).toBe("transfer_to_agent");
		const declarations = request.config?.tools?.flatMap(
			(t) => t.functionDeclarations ?? [],
		);
		expect(declarations?.some((d) => d.name === "transfer_to_agent")).toBe(
			true,
		);
	});

	it("lists only children when parentAgent lacks subAgents", async () => {
		const request = new LlmRequest();
		const child = new StubAgent("worker", "Does work");
		const agent = new StubAgent("orchestrator", "Routes work");
		agent.subAgents = [child];
		child.parentAgent = agent;
		agent.parentAgent = { name: "bare_parent" } as any;

		for await (const _ of requestProcessor.runAsync(
			makeContext(agent),
			request,
		)) {
		}

		expect(request.config?.systemInstruction).toContain("worker");
		expect(request.config?.systemInstruction).toContain(
			"Your parent agent is bare_parent",
		);
		expect(request.config?.systemInstruction).not.toMatch(
			/Agent name: bare_parent/,
		);
	});

	it("allows peers but omits parent when only parent transfer is disallowed", async () => {
		const request = new LlmRequest();
		const parent = new StubAgent("parent", "Parent agent");
		const peer = new StubAgent("peer", "Peer specialist");
		const agent = new StubAgent("child", "Child agent");
		(agent as any).disallowTransferToParent = true;
		(agent as any).disallowTransferToPeers = false;
		parent.subAgents = [agent, peer];
		agent.parentAgent = parent;
		peer.parentAgent = parent;
		agent.subAgents = [new StubAgent("leaf", "Leaf")];

		for await (const _ of requestProcessor.runAsync(
			makeContext(agent),
			request,
		)) {
		}

		const instruction = String(request.config?.systemInstruction ?? "");
		expect(instruction).toContain("leaf");
		expect(instruction).toContain("peer");
		expect(instruction).toContain("Peer specialist");
		expect(instruction).not.toContain("Your parent agent is parent");
		expect(instruction).not.toMatch(/Agent name: parent/);
	});

	it("allows parent but omits peers when only peer transfer is disallowed", async () => {
		const request = new LlmRequest();
		const parent = new StubAgent("parent", "Parent agent");
		const peer = new StubAgent("peer", "Peer specialist");
		const agent = new StubAgent("child", "Child agent");
		(agent as any).disallowTransferToParent = false;
		(agent as any).disallowTransferToPeers = true;
		parent.subAgents = [agent, peer];
		agent.parentAgent = parent;
		peer.parentAgent = parent;
		agent.subAgents = [new StubAgent("leaf", "Leaf")];

		for await (const _ of requestProcessor.runAsync(
			makeContext(agent),
			request,
		)) {
		}

		const instruction = String(request.config?.systemInstruction ?? "");
		expect(instruction).toContain("leaf");
		expect(instruction).toContain("Your parent agent is parent");
		expect(instruction).toMatch(/Agent name: parent/);
		expect(instruction).not.toContain("Peer specialist");
		expect(instruction).not.toMatch(/Agent name: peer/);
	});

	it("still emits Agent description line when description is empty", async () => {
		const request = new LlmRequest();
		const child = new StubAgent("worker", "");
		const agent = new StubAgent("orchestrator", "Routes");
		agent.subAgents = [child];
		child.parentAgent = agent;

		for await (const _ of requestProcessor.runAsync(
			makeContext(agent),
			request,
		)) {
		}

		expect(request.config?.systemInstruction).toContain("Agent name: worker");
		expect(request.config?.systemInstruction).toContain("Agent description:");
	});

	it("includes parent target when parent has empty peer list", async () => {
		const request = new LlmRequest();
		const parent = new StubAgent("parent", "Solo parent");
		const agent = new StubAgent("only_child", "Only child");
		parent.subAgents = [agent];
		agent.parentAgent = parent;
		agent.subAgents = [new StubAgent("grandchild", "GC")];

		for await (const _ of requestProcessor.runAsync(
			makeContext(agent),
			request,
		)) {
		}

		const instruction = String(request.config?.systemInstruction ?? "");
		expect(instruction).toContain("grandchild");
		expect(instruction).toContain("Your parent agent is parent");
		expect(instruction).toMatch(/Agent name: parent/);
		expect(instruction).not.toContain("only_child");
	});

	it("skips when subAgents is a non-array object", async () => {
		const request = new LlmRequest();
		const context = {
			agent: { name: "weird", subAgents: { a: 1 } },
			pluginManager: new PluginManager(),
		} as unknown as InvocationContext;

		for await (const _ of requestProcessor.runAsync(context, request)) {
		}

		expect(request.config?.systemInstruction).toBeUndefined();
		expect(request.toolsDict.transfer_to_agent).toBeUndefined();
	});
});
