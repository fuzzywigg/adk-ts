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
		invocationId: "e-transfer-peer-case",
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

describe("agent-transfer peer name !== filter case-sensitivity tenth leftover", () => {
	it("peer named Leaf is not filtered when the agent is leaf", async () => {
		const request = new LlmRequest();
		const parent = new StubAgent("parent", "Parent");
		const child = new StubAgent("leaf", "Leaf worker");
		const peer = new StubAgent("Leaf", "Capitalized peer");
		parent.subAgents = [child, peer];
		child.parentAgent = parent;
		peer.parentAgent = parent;

		await drain(requestProcessor.runAsync(makeContext(child), request));

		const instruction = String(request.config?.systemInstruction ?? "");
		expect(instruction).toContain("Agent name: Leaf");
		expect(instruction).toContain("Capitalized peer");
		expect(instruction).toContain("Your parent agent is parent");
	});

	it("exact duplicate peer name is filtered out of transfer targets", async () => {
		const request = new LlmRequest();
		const parent = new StubAgent("parent", "Parent");
		const child = new StubAgent("leaf", "Leaf worker");
		const twin = new StubAgent("leaf", "Twin");
		parent.subAgents = [child, twin];
		child.parentAgent = parent;
		twin.parentAgent = parent;

		await drain(requestProcessor.runAsync(makeContext(child), request));

		const instruction = String(request.config?.systemInstruction ?? "");
		expect(instruction).not.toContain("Twin");
		expect(instruction).toContain("Agent name: parent");
	});
});
