import { describe, expect, it, vi } from "vitest";
import type { InvocationContext } from "../../../agents/invocation-context";
import { BaseAgent } from "../../../agents/base-agent";
import { requestProcessor as agentTransferProcessor } from "../../../flows/llm-flows/agent-transfer";
import { requestProcessor as basicProcessor } from "../../../flows/llm-flows/basic";
import { LlmRequest } from "../../../models/llm-request";

vi.mock("../../../logger", () => ({
	Logger: vi.fn(() => ({
		debug: vi.fn(),
		error: vi.fn(),
		warn: vi.fn(),
		info: vi.fn(),
	})),
}));

class StubAgent extends BaseAgent {
	subAgents: BaseAgent[] = [];
	parentAgent?: BaseAgent;
	disallowTransferToParent?: boolean;
	disallowTransferToPeers?: boolean;

	constructor(name: string, description = "") {
		super({ name, description });
	}

	async *runAsyncImpl() {
		/* no-op */
	}
}

function makeTransferContext(agent: StubAgent): InvocationContext {
	return {
		agent,
		session: { id: "s", appName: "a", userId: "u", events: [] },
		invocationId: "inv",
		runConfig: {},
	} as unknown as InvocationContext;
}

async function drain(
	gen: AsyncGenerator<unknown, void, unknown>,
): Promise<void> {
	for await (const _ of gen) {
		/* no events expected */
	}
}

describe("agent-transfer leftover edges (overnight TOKENMAXX post #150)", () => {
	it("returns early when subAgents is a non-array object without mutating toolsDict", async () => {
		const request = new LlmRequest();
		const agent = new StubAgent("weird", "Weird agent");
		(agent as any).subAgents = { not: "array" };

		await drain(
			agentTransferProcessor.runAsync(makeTransferContext(agent), request),
		);

		expect(request.toolsDict.transfer_to_agent).toBeUndefined();
		expect(request.config?.systemInstruction).toBeUndefined();
	});

	it("throws when parentAgent.subAgents is a non-array object during peer filter", async () => {
		const request = new LlmRequest();
		const child = new StubAgent("leaf", "Leaf");
		const agent = new StubAgent("mid", "Mid");
		agent.subAgents = [child];
		child.parentAgent = agent;
		agent.parentAgent = {
			name: "parent",
			subAgents: { broken: true },
		} as any;

		await expect(
			drain(
				agentTransferProcessor.runAsync(makeTransferContext(agent), request),
			),
		).rejects.toThrow(/filter is not a function/);
	});

	it("still interpolates parent name when parentAgent.name is empty string", async () => {
		const request = new LlmRequest();
		const agent = new StubAgent("child", "Child");
		const parent = {
			name: "",
			description: "Nameless parent",
			subAgents: [agent],
		} as any;
		agent.parentAgent = parent;

		await drain(
			agentTransferProcessor.runAsync(makeTransferContext(agent), request),
		);

		expect(request.config?.systemInstruction).toContain(
			"Your parent agent is .",
		);
	});

	it("throws when sparse subAgents array includes an undefined hole", async () => {
		const request = new LlmRequest();
		const child = new StubAgent("worker", "Does work");
		const agent = new StubAgent("orch", "Routes");
		const sparse: BaseAgent[] = [];
		sparse[1] = child;
		agent.subAgents = sparse;
		child.parentAgent = agent;

		await expect(
			drain(
				agentTransferProcessor.runAsync(makeTransferContext(agent), request),
			),
		).rejects.toThrow();
	});

	it("includes peers and parent together when both transfers allowed", async () => {
		const request = new LlmRequest();
		const parent = new StubAgent("parent", "Parent agent");
		const peer = new StubAgent("peer", "Peer helper");
		const agent = new StubAgent("child", "Child");
		const leaf = new StubAgent("leaf", "Leaf");
		parent.subAgents = [agent, peer];
		agent.parentAgent = parent;
		peer.parentAgent = parent;
		agent.subAgents = [leaf];
		leaf.parentAgent = agent;

		await drain(
			agentTransferProcessor.runAsync(makeTransferContext(agent), request),
		);

		const instruction = String(request.config?.systemInstruction ?? "");
		expect(instruction).toContain("Agent name: leaf");
		expect(instruction).toContain("Agent name: peer");
		expect(instruction).toContain("Your parent agent is parent");
	});
});

describe("basic requestProcessor leftover edges (overnight TOKENMAXX post #150)", () => {
	it("applies output schema when canonicalTools property is absent", async () => {
		const schema = { type: "object", properties: { a: { type: "string" } } };
		const llmRequest = new LlmRequest();
		await drain(
			basicProcessor.runAsync(
				{
					agent: {
						name: "no-tools-prop",
						canonicalModel: "gpt-4o",
						outputSchema: schema,
						subAgents: [],
					},
					runConfig: {},
				} as unknown as InvocationContext,
				llmRequest,
			),
		);
		expect(llmRequest.config?.responseSchema).toBe(schema);
	});

	it("applies output schema when subAgents is a non-array object without length", async () => {
		const schema = { type: "object" };
		const llmRequest = new LlmRequest();
		await drain(
			basicProcessor.runAsync(
				{
					agent: {
						name: "obj-subs",
						canonicalModel: "gpt-4o",
						outputSchema: schema,
						canonicalTools: async () => [],
						subAgents: { a: 1 },
					},
					runConfig: {},
				} as unknown as InvocationContext,
				llmRequest,
			),
		);
		expect(llmRequest.config?.responseSchema).toBe(schema);
	});

	it("skips schema when subAgents exist and only peers transfer is disallowed", async () => {
		const schema = { type: "object" };
		const llmRequest = new LlmRequest();
		await drain(
			basicProcessor.runAsync(
				{
					agent: {
						name: "parent-ok",
						canonicalModel: "gpt-4o",
						outputSchema: schema,
						canonicalTools: async () => [],
						subAgents: [{ name: "child" }],
						disallowTransferToParent: false,
						disallowTransferToPeers: true,
					},
					runConfig: {},
				} as unknown as InvocationContext,
				llmRequest,
			),
		);
		expect(llmRequest.config?.responseSchema).toBeUndefined();
	});

	it("JSON deep-copy drops undefined keys from generateContentConfig", async () => {
		const llmRequest = new LlmRequest();
		await drain(
			basicProcessor.runAsync(
				{
					agent: {
						name: "undef-cfg",
						canonicalModel: "gpt-4o",
						generateContentConfig: {
							temperature: 0.1,
							topP: undefined,
							nested: { keep: true, drop: undefined },
						},
					},
					runConfig: {},
				} as InvocationContext,
				llmRequest,
			),
		);
		expect(llmRequest.config).toEqual({
			temperature: 0.1,
			nested: { keep: true },
		});
		expect("topP" in (llmRequest.config as object)).toBe(false);
	});

	it("re-initializes liveConnectConfig when pre-existing value is null", async () => {
		const llmRequest = new LlmRequest();
		(llmRequest as any).liveConnectConfig = null;
		await drain(
			basicProcessor.runAsync(
				{
					agent: { name: "null-live", canonicalModel: "gpt-4o" },
					runConfig: {
						responseModalities: ["TEXT"],
						enableAffectiveDialog: true,
					},
				} as unknown as InvocationContext,
				llmRequest,
			),
		);
		expect(llmRequest.liveConnectConfig).toBeDefined();
		expect(llmRequest.liveConnectConfig.responseModalities).toEqual(["TEXT"]);
		expect(llmRequest.liveConnectConfig.enableAffectiveDialog).toBe(true);
	});

	it("ignores logger.debug failures while skipping output schema", async () => {
		const { Logger } = await import("../../../logger");
		(Logger as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(
			() => ({
				debug: () => {
					throw new Error("logger down");
				},
				error: vi.fn(),
				warn: vi.fn(),
				info: vi.fn(),
			}),
		);

		const schema = { type: "object" };
		const llmRequest = new LlmRequest();
		await drain(
			basicProcessor.runAsync(
				{
					agent: {
						name: "logger-skip",
						canonicalModel: "gpt-4o",
						outputSchema: schema,
						canonicalTools: async () => [{ name: "t" }],
						subAgents: [],
					},
					runConfig: {},
				} as unknown as InvocationContext,
				llmRequest,
			),
		);
		expect(llmRequest.config?.responseSchema).toBeUndefined();
	});

	it("treats empty string canonicalModel as model value", async () => {
		const llmRequest = new LlmRequest();
		await drain(
			basicProcessor.runAsync(
				{
					agent: { name: "empty-model", canonicalModel: "" },
					runConfig: {},
				} as InvocationContext,
				llmRequest,
			),
		);
		expect(llmRequest.model).toBe("");
	});
});
