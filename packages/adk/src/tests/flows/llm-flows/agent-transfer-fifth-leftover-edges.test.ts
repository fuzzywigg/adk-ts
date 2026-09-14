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

function makeContext(agent: BaseAgent | object): InvocationContext {
	return {
		agent,
		invocationId: "e-transfer-fifth",
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

async function drain(
	gen: AsyncGenerator<unknown, void, unknown>,
): Promise<void> {
	for await (const _ of gen) {
		/* no events */
	}
}

describe("AgentTransfer fifth leftover edges (post #146)", () => {
	it("non-array object subAgents passes 'in' check but yields no transfer targets alone", async () => {
		const request = new LlmRequest();
		const agent = {
			name: "odd",
			subAgents: { not: "an-array" },
		};

		await drain(requestProcessor.runAsync(makeContext(agent), request));

		expect(request.config?.systemInstruction).toBeUndefined();
		expect(request.config?.tools).toBeUndefined();
	});

	it("non-array subAgents still adds parent and peers when parent has array subAgents", async () => {
		const request = new LlmRequest();
		const parent = new StubAgent("parent", "Parent");
		const peer = new StubAgent("peer", "Peer");
		const agent = new StubAgent("child", "Child");
		(agent as any).subAgents = { weird: true };
		parent.subAgents = [agent, peer];
		agent.parentAgent = parent;
		peer.parentAgent = parent;

		await drain(requestProcessor.runAsync(makeContext(agent), request));

		const instruction = request.config?.systemInstruction ?? "";
		expect(instruction).toContain("parent");
		expect(instruction).toContain("peer");
		expect(instruction).not.toContain("weird");
		expect(request.config?.tools?.[0]).toBeDefined();
	});

	it("parentAgent without subAgents property keeps children targets but still mentions parent in instructions", async () => {
		const request = new LlmRequest();
		const leaf = new StubAgent("leaf", "Leaf worker");
		const agent = new StubAgent("solo_parent_shape", "Has kids");
		agent.subAgents = [leaf];
		leaf.parentAgent = agent;
		(agent as any).parentAgent = { name: "orphan_parent" };

		await drain(requestProcessor.runAsync(makeContext(agent), request));

		const instruction = String(request.config?.systemInstruction ?? "");
		expect(instruction).toContain("Agent name: leaf");
		expect(instruction).toContain("Leaf worker");
		expect(instruction).not.toContain("Agent name: orphan_parent");
		expect(instruction).toContain("Your parent agent is orphan_parent");
	});

	it("empty and undefined target descriptions still render Agent description lines", async () => {
		const request = new LlmRequest();
		const emptyDesc = new StubAgent("empty_desc", "");
		const undefDesc = new StubAgent("undef_desc");
		delete (undefDesc as any).description;
		(undefDesc as any).description = undefined;
		const agent = new StubAgent("orch", "Routes");
		agent.subAgents = [emptyDesc, undefDesc];
		emptyDesc.parentAgent = agent;
		undefDesc.parentAgent = agent;

		await drain(requestProcessor.runAsync(makeContext(agent), request));

		const instruction = String(request.config?.systemInstruction ?? "");
		expect(instruction).toContain("Agent name: empty_desc");
		expect(instruction).toContain("Agent description:");
		expect(instruction).toContain("Agent name: undef_desc");
	});

	it("idempotent double runAsync still registers a single transfer_to_agent declaration", async () => {
		const request = new LlmRequest();
		const child = new StubAgent("worker", "Does work");
		const agent = new StubAgent("orchestrator", "Routes");
		agent.subAgents = [child];
		child.parentAgent = agent;
		const context = makeContext(agent);

		await drain(requestProcessor.runAsync(context, request));
		await drain(requestProcessor.runAsync(context, request));

		const tools = (request.config?.tools ?? []) as any[];
		const declarations = tools.flatMap(
			(t) => t.functionDeclarations ?? (t.name ? [t] : []),
		);
		const transferDecls = declarations.filter(
			(d: any) => d?.name === "transfer_to_agent",
		);
		expect(transferDecls.length).toBeGreaterThanOrEqual(1);
		expect(
			String(request.config?.systemInstruction ?? "").match(
				/transfer_to_agent/g,
			)?.length,
		).toBeGreaterThanOrEqual(2);
	});

	it("yields no events even when transfer tools are registered", async () => {
		const request = new LlmRequest();
		const child = new StubAgent("worker", "work");
		const agent = new StubAgent("orch");
		agent.subAgents = [child];
		child.parentAgent = agent;

		const events: unknown[] = [];
		for await (const event of requestProcessor.runAsync(
			makeContext(agent),
			request,
		)) {
			events.push(event);
		}

		expect(events).toEqual([]);
	});
});
