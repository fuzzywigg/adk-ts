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
		invocationId: "e-transfer-14",
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

/**
 * Fourteenth leftover: disallow `"true"`/`[]`/`1` omit parent/peers like
 * boolean true (residual after falsy-asymmetry leftover).
 */
describe("agent-transfer disallow string-true/empty-array fourteenth leftover", () => {
	it.each([
		{ label: "string-true", value: "true" },
		{ label: "empty-array", value: [] },
		{ label: "1", value: 1 },
	] as const)("disallowTransferToParent=$label omits parent", async ({
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
		{ label: "string-true", value: "true" },
		{ label: "empty-array", value: [] },
	] as const)("disallowTransferToPeers=$label omits peers", async ({
		value,
	}) => {
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

	it("disallowTransferToParent=-0 remains falsy so parent stays listed", async () => {
		const request = new LlmRequest();
		const parent = new StubAgent("parent", "Parent");
		const child = new StubAgent("child", "Child");
		parent.subAgents = [child];
		child.parentAgent = parent;
		(child as any).disallowTransferToParent = -0;

		await drain(requestProcessor.runAsync(makeContext(child), request));

		const instruction = request.config?.systemInstruction ?? "";
		expect(instruction).toContain("parent");
	});
});
