import { describe, expect, it, vi } from "vitest";
import { AutoFlow, SingleFlow } from "@adk/flows";
import { requestProcessor as agentTransferRequestProcessor } from "../../../flows/llm-flows/agent-transfer";
import { requestProcessor as identityRequestProcessor } from "../../../flows/llm-flows/identity";
import { LlmRequest } from "../../../models/llm-request";
import type { InvocationContext } from "../../../agents/invocation-context";

vi.mock("@adk/logger", () => ({
	Logger: vi.fn(() => ({
		debug: vi.fn(),
		error: vi.fn(),
		warn: vi.fn(),
		info: vi.fn(),
	})),
}));

async function collect(
	gen: AsyncGenerator<unknown, void, unknown>,
): Promise<unknown[]> {
	const items: unknown[] = [];
	for await (const item of gen) {
		items.push(item);
	}
	return items;
}

describe("AutoFlow composition leftover edges (post #141)", () => {
	it("instances do not share mutated processor arrays", () => {
		const a = new AutoFlow();
		const b = new AutoFlow();
		const before = a.requestProcessors.length;
		a.requestProcessors.push({ marker: true } as any);
		expect(a.requestProcessors.length).toBe(before + 1);
		expect(b.requestProcessors.length).toBe(before);
		expect(b.requestProcessors.at(-1)).toBe(agentTransferRequestProcessor);
	});

	it("response processor arrays are independent copies with equal contents", () => {
		const a = new AutoFlow();
		const b = new AutoFlow();
		expect(a.responseProcessors).not.toBe(b.responseProcessors);
		expect(a.responseProcessors).toEqual(b.responseProcessors);
		a.responseProcessors.pop();
		expect(a.responseProcessors.length).toBe(b.responseProcessors.length - 1);
	});

	it("SingleFlow prefix identity is preserved across fresh AutoFlow builds", () => {
		for (let i = 0; i < 5; i++) {
			const single = new SingleFlow();
			const auto = new AutoFlow();
			expect(auto.requestProcessors.slice(0, -1)).toEqual(
				single.requestProcessors,
			);
			expect(auto.requestProcessors.at(-1)).toBe(agentTransferRequestProcessor);
		}
	});

	it("agent transfer appears exactly once even after cloning processor list", () => {
		const auto = new AutoFlow();
		const cloned = [...auto.requestProcessors];
		expect(
			cloned.filter((p) => p === agentTransferRequestProcessor),
		).toHaveLength(1);
	});

	it("AutoFlow remains instanceof SingleFlow after construction", () => {
		expect(new AutoFlow()).toBeInstanceOf(SingleFlow);
		expect(new AutoFlow()).toBeInstanceOf(AutoFlow);
	});
});

describe("identity requestProcessor leftover matrix (post #141)", () => {
	it.each([
		{ name: "a", description: undefined },
		{ name: "b", description: null as any },
		{ name: "c", description: "" },
	])("omits description block when description is $description", async ({
		name,
		description,
	}) => {
		const llmRequest = new LlmRequest();
		await collect(
			identityRequestProcessor.runAsync(
				{ agent: { name, description } } as InvocationContext,
				llmRequest,
			),
		);
		const text = llmRequest.getSystemInstructionText() ?? "";
		expect(text).toContain(`Your internal name is "${name}"`);
		expect(text).not.toContain("The description about you");
	});

	it("includes whitespace-only description because it is truthy", async () => {
		const llmRequest = new LlmRequest();
		await collect(
			identityRequestProcessor.runAsync(
				{ agent: { name: "ws", description: "   " } } as InvocationContext,
				llmRequest,
			),
		);
		expect(llmRequest.getSystemInstructionText()).toContain(
			'The description about you is "   "',
		);
	});

	it.each([
		{ name: "agent-1", description: "simple" },
		{ name: "agent_2", description: 'quote "inside"' },
		{ name: "agent.3", description: "line1\nline2" },
		{ name: "中文", description: "描述" },
	])("includes description for name=$name", async ({ name, description }) => {
		const llmRequest = new LlmRequest();
		await collect(
			identityRequestProcessor.runAsync(
				{ agent: { name, description } } as InvocationContext,
				llmRequest,
			),
		);
		const text = llmRequest.getSystemInstructionText() ?? "";
		expect(text).toContain(`Your internal name is "${name}"`);
		expect(text).toContain(`The description about you is "${description}"`);
	});

	it("appends after multiple existing instruction blocks", async () => {
		const llmRequest = new LlmRequest();
		llmRequest.appendInstructions(["First."]);
		llmRequest.appendInstructions(["Second."]);
		await collect(
			identityRequestProcessor.runAsync(
				{ agent: { name: "multi", description: "desc" } } as InvocationContext,
				llmRequest,
			),
		);
		const text = llmRequest.getSystemInstructionText() ?? "";
		expect(text.indexOf("First.")).toBeLessThan(text.indexOf("Second."));
		expect(text.indexOf("Second.")).toBeLessThan(
			text.indexOf('Your internal name is "multi"'),
		);
		expect(text).toContain('The description about you is "desc"');
	});

	it("yields an empty event list for every matrix case", async () => {
		for (const agent of [
			{ name: "x" },
			{ name: "y", description: "z" },
			{ name: "w", description: "" },
		]) {
			const events = await collect(
				identityRequestProcessor.runAsync(
					{ agent } as InvocationContext,
					new LlmRequest(),
				),
			);
			expect(events).toEqual([]);
		}
	});

	it("does not replace pre-existing system instruction content", async () => {
		const llmRequest = new LlmRequest();
		llmRequest.appendInstructions(["Keep me."]);
		await collect(
			identityRequestProcessor.runAsync(
				{ agent: { name: "keep" } } as InvocationContext,
				llmRequest,
			),
		);
		expect(llmRequest.getSystemInstructionText()?.startsWith("Keep me.")).toBe(
			true,
		);
	});
});
