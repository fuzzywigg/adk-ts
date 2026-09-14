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
		invocationId: "e-transfer-case",
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

describe("agent-transfer peer name !== case twelfth leftover", () => {
	it("exact same name is filtered out of peer targets", async () => {
		const request = new LlmRequest();
		const parent = new StubAgent("parent", "Parent");
		const child = new StubAgent("child", "Child");
		const twin = new StubAgent("child", "Twin same name");
		parent.subAgents = [child, twin];
		child.parentAgent = parent;
		twin.parentAgent = parent;

		await drain(requestProcessor.runAsync(makeContext(child), request));

		const instruction = request.config?.systemInstruction ?? "";
		expect(instruction).toContain("parent");
		expect(instruction).not.toContain("Twin same name");
	});

	it("case-near-miss peer name stays in the transfer list", async () => {
		const request = new LlmRequest();
		const parent = new StubAgent("parent", "Parent");
		const child = new StubAgent("child", "Child");
		const cased = new StubAgent("Child", "Cased peer");
		parent.subAgents = [child, cased];
		child.parentAgent = parent;
		cased.parentAgent = parent;

		await drain(requestProcessor.runAsync(makeContext(child), request));

		const instruction = String(request.config?.systemInstruction ?? "");
		expect(instruction).toContain("Cased peer");
		expect(instruction).toContain("Child");
	});
});
