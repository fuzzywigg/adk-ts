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
		invocationId: "e-transfer-nineteenth",
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
	}
}

/**
 * Nineteenth leftover (flows residual): `!agent.disallowTransferToParent` —
 * string `"0"`/`"false"` are truthy so parent is omitted (asymmetry leftover
 * only covered falsy 0/false/"").
 */
describe("agent-transfer disallow string-zero/false truthy nineteenth leftover", () => {
	it.each([
		{ label: "string-zero", value: "0" },
		{ label: "string-false", value: "false" },
	])("disallowTransferToParent=$label omits parent transfer text", async ({
		value,
	}) => {
		const request = new LlmRequest();
		const parent = new StubAgent("parent", "Parent");
		const child = new StubAgent("child", "Child");
		parent.subAgents = [child];
		child.parentAgent = parent;
		(child as any).disallowTransferToParent = value;

		await drain(requestProcessor.runAsync(makeContext(child), request));

		const instruction = request.config?.systemInstruction ?? "";
		expect(instruction).not.toContain("Your parent agent is parent");
	});

	it.each([
		{ label: "string-zero", value: "0" },
		{ label: "string-false", value: "false" },
	])("disallowTransferToPeers=$label omits peer listing", async ({ value }) => {
		const request = new LlmRequest();
		const parent = new StubAgent("parent", "Parent");
		const peer = new StubAgent("peer", "Peer");
		const child = new StubAgent("child", "Child");
		parent.subAgents = [child, peer];
		child.parentAgent = parent;
		peer.parentAgent = parent;
		(child as any).disallowTransferToPeers = value;

		await drain(requestProcessor.runAsync(makeContext(child), request));

		const instruction = request.config?.systemInstruction ?? "";
		expect(instruction).not.toContain("peer");
	});
});
