import { describe, expect, it } from "vitest";
import { requestProcessor } from "../../../flows/llm-flows/agent-transfer";
import { LlmRequest } from "../../../models/llm-request";
import type { InvocationContext } from "../../../agents/invocation-context";
import { BaseAgent } from "../../../agents/base-agent";
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
});
