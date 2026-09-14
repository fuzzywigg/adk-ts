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

/**
 * Sixth leftover: peer filter uses `peerAgent.name !== agent.name` (===).
 * A sibling named `Child` is still a peer of `child`.
 */
describe("agent-transfer peer name case-sensitivity sixth leftover edges", () => {
	it("lists differently-cased sibling as a peer transfer target", async () => {
		const parent = new StubAgent("parent", "Parent");
		const child = new StubAgent("child", "lowercase child");
		const peer = new StubAgent("Child", "Titlecase sibling");
		parent.subAgents = [child, peer];
		child.parentAgent = parent;
		peer.parentAgent = parent;

		const request = new LlmRequest();
		await drain(requestProcessor.runAsync(makeContext(child), request));

		const instruction = String(request.config?.systemInstruction ?? "");
		expect(instruction).toContain("Agent name: Child");
		expect(instruction).toContain("Titlecase sibling");
		expect(instruction).not.toMatch(/Agent name: child\n/);
	});

	it("does not list an exact-name duplicate of self (control)", async () => {
		const parent = new StubAgent("parent", "Parent");
		const child = new StubAgent("child", "Child");
		const twin = new StubAgent("child", "Twin same name");
		parent.subAgents = [child, twin];
		child.parentAgent = parent;
		twin.parentAgent = parent;

		const request = new LlmRequest();
		await drain(requestProcessor.runAsync(makeContext(child), request));

		const instruction = String(request.config?.systemInstruction ?? "");
		expect(instruction).not.toContain("Twin same name");
		expect(instruction).toContain("Agent name: parent");
	});
});
