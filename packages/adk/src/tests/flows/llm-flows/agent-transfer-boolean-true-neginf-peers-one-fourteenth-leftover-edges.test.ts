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
		invocationId: "e-transfer-14h",
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
 * Fourteenth leftover (HEAVY tip-relaunch residual after #243):
 * agent-transfer disallow residual — boolean `true` / `NEGATIVE_INFINITY` omit
 * parent; peers `1` omit; `-0` peers still listed.
 */
describe("agent-transfer boolean-true/neginf/peers-one fourteenth leftover", () => {
	it.each([
		{ label: "boolean-true", value: true },
		{ label: "NEGATIVE_INFINITY", value: Number.NEGATIVE_INFINITY },
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

	it("disallowTransferToPeers=1 omits peers", async () => {
		const request = new LlmRequest();
		const parent = new StubAgent("parent", "Parent");
		const peer = new StubAgent("peer", "Peer");
		const child = new StubAgent("child", "Child");
		parent.subAgents = [child, peer];
		child.parentAgent = parent;
		peer.parentAgent = parent;
		(child as any).disallowTransferToPeers = 1;

		await drain(requestProcessor.runAsync(makeContext(child), request));

		const instruction = request.config?.systemInstruction ?? "";
		expect(instruction).not.toContain("peer");
	});

	it("disallowTransferToPeers=-0 remains falsy so peers stay listed", async () => {
		const request = new LlmRequest();
		const parent = new StubAgent("parent", "Parent");
		const peer = new StubAgent("peer", "Peer");
		const child = new StubAgent("child", "Child");
		parent.subAgents = [child, peer];
		child.parentAgent = parent;
		peer.parentAgent = parent;
		(child as any).disallowTransferToPeers = -0;

		await drain(requestProcessor.runAsync(makeContext(child), request));

		const instruction = request.config?.systemInstruction ?? "";
		expect(instruction).toContain("peer");
	});
});
