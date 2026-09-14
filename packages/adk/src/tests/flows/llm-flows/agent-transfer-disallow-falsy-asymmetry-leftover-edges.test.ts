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
		invocationId: "e-transfer-falsy",
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

describe("agent-transfer disallow falsy asymmetry leftover (post #168)", () => {
	it.each([
		{ label: "0", value: 0 },
		{ label: "empty-string", value: "" },
		{ label: "null", value: null },
		{ label: "false", value: false },
	] as const)("disallowTransferToParent=$label is falsy so parent transfer stays allowed", async ({
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
		expect(instruction).toContain("parent");
		expect(request.config?.tools?.[0]).toBeDefined();
	});

	it.each([
		{ label: "0", value: 0 },
		{ label: "empty-string", value: "" },
	] as const)("disallowTransferToPeers=$label is falsy so peers stay listed", async ({
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
		expect(instruction).toContain("peer");
	});

	it("truthy disallowTransferToParent=true still omits parent", async () => {
		const request = new LlmRequest();
		const parent = new StubAgent("parent", "Parent");
		const child = new StubAgent("child", "Child");
		parent.subAgents = [child];
		child.parentAgent = parent;
		(child as any).disallowTransferToParent = true;

		await drain(requestProcessor.runAsync(makeContext(child), request));

		const instruction = request.config?.systemInstruction ?? "";
		expect(instruction).not.toContain("Your parent agent is parent");
	});
});
