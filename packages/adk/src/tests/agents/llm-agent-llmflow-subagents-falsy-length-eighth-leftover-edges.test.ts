import { describe, expect, it, vi } from "vitest";
import { BaseAgent } from "../../agents/base-agent";
import { LlmAgent } from "../../agents/llm-agent";
import { AutoFlow, SingleFlow } from "../../flows/llm-flows";

vi.mock("../../flows/llm-flows", () => ({
	SingleFlow: vi.fn(function (this: unknown) {
		return this;
	}),
	AutoFlow: vi.fn(function (this: unknown) {
		return this;
	}),
}));

/**
 * Eighth leftover: llmFlow uses `!this.subAgents?.length` with transfer locks.
 * Empty array → SingleFlow; forced falsy subAgents (0/null/false) also
 * treat length as missing so SingleFlow wins when transfers are locked.
 */
describe("LlmAgent llmFlow subAgents falsy length eighth leftover", () => {
	it("locked transfers + empty subAgents → SingleFlow", () => {
		const agent = new LlmAgent({
			name: "locked_empty",
			disallowTransferToParent: true,
			disallowTransferToPeers: true,
			subAgents: [],
		});
		expect(agent["llmFlow"]).toBeInstanceOf(SingleFlow);
	});

	it.each([
		{ label: "null", value: null },
		{ label: "0", value: 0 },
		{ label: "false", value: false },
	])("locked transfers + forced subAgents $label → SingleFlow via ?.length", ({
		value,
	}) => {
		const agent = new LlmAgent({
			name: `locked_${String(value)}`,
			disallowTransferToParent: true,
			disallowTransferToPeers: true,
		});
		(agent as any).subAgents = value;
		expect(agent["llmFlow"]).toBeInstanceOf(SingleFlow);
	});

	it("locked transfers + one subAgent → AutoFlow", () => {
		class Shell extends BaseAgent {
			protected async *runAsyncImpl() {}
			protected async *runLiveImpl() {}
		}
		const agent = new LlmAgent({
			name: "locked_with_child",
			disallowTransferToParent: true,
			disallowTransferToPeers: true,
			subAgents: [new Shell({ name: "child", description: "" })],
		});
		expect(agent["llmFlow"]).toBeInstanceOf(AutoFlow);
	});
});
