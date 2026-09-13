import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InvocationContext } from "../../agents/invocation-context";
import { LlmAgent } from "../../agents/llm-agent";
import { Event } from "../../events/event";
import { AutoFlow, SingleFlow } from "../../flows/llm-flows";
import { BaseLlm } from "../../models/base-llm";
import { LLMRegistry } from "../../models/llm-registry";
import { FunctionTool } from "../../tools/function/function-tool";

vi.mock("@adk/helpers/logger", () => ({
	Logger: vi.fn(() => ({
		debug: vi.fn(),
		error: vi.fn(),
		warn: vi.fn(),
	})),
}));

vi.mock("../../flows/llm-flows", () => ({
	SingleFlow: vi.fn(function () {
		this.runAsync = vi.fn();
	}),
	AutoFlow: vi.fn(function () {
		this.runAsync = vi.fn();
	}),
}));

const mockContext: InvocationContext = {
	invocationId: "test-inv-id",
	agent: {} as any,
	branch: [],
	session: {
		id: "ses-123",
		userId: "user-123",
		appName: "test-app",
		state: {},
		events: [],
		lastUpdateTime: 0,
	} as any,
	endInvocation: false,
	createChildContext: vi.fn(),
} as unknown as InvocationContext;

describe("LlmAgent (Run Logic)", () => {
	let agent: LlmAgent;

	beforeEach(() => {
		vi.clearAllMocks();
		agent = new LlmAgent({
			name: "testAgent",
			description: "A test agent",
		});
	});

	describe("maybeSaveOutputToState", () => {
		it("should do nothing if outputKey is not set", () => {
			const event = new Event({ author: agent.name });
			agent["maybeSaveOutputToState"](event);
			expect(event.actions.stateDelta).toStrictEqual({});
		});

		it("should do nothing if the event is not a final response", () => {
			agent.outputKey = "result";
			const event = new Event({ author: agent.name });
			vi.spyOn(event, "isFinalResponse").mockReturnValue(false);

			agent["maybeSaveOutputToState"](event);
			expect(event.actions.stateDelta).toStrictEqual({});
		});

		it("should do nothing if the event has no content parts", () => {
			agent.outputKey = "result";
			const event = new Event({ content: { parts: [] }, author: agent.name });
			vi.spyOn(event, "isFinalResponse").mockReturnValue(true);

			agent["maybeSaveOutputToState"](event);
			expect(event.actions.stateDelta).toStrictEqual({});
		});

		it("should save concatenated text to stateDelta if conditions are met", () => {
			agent.outputKey = "result";
			const event = new Event({
				content: { parts: [{ text: "Hello " }, { text: "World" }] },
				author: agent.name,
			});
			vi.spyOn(event, "isFinalResponse").mockReturnValue(true);

			agent["maybeSaveOutputToState"](event);

			expect(event.actions.stateDelta).toBeDefined();
			expect(event.actions.stateDelta?.result).toBe("Hello World");
		});

		it("should create stateDelta object if it does not exist", () => {
			agent.outputKey = "result";
			const event = new Event({
				content: { parts: [{ text: "data" }] },
				author: agent.name,
			});
			vi.spyOn(event, "isFinalResponse").mockReturnValue(true);
			event.actions = { stateDelta: undefined, artifactDelta: undefined };

			agent["maybeSaveOutputToState"](event);

			expect(event.actions.stateDelta).toBeDefined();
			expect(event.actions.stateDelta?.result).toBe("data");
		});

		it("should not save to state if the resulting text is empty", () => {
			agent.outputKey = "result";
			const event = new Event({
				content: { parts: [{ text: "" }, { text: undefined as any }] },
				author: agent.name,
			});
			event.actions = { stateDelta: undefined, artifactDelta: undefined };
			vi.spyOn(event, "isFinalResponse").mockReturnValue(true);

			agent["maybeSaveOutputToState"](event);
			expect(event.actions.stateDelta).toBeUndefined();
		});

		it("skips events authored by another agent", () => {
			agent.outputKey = "result";
			const event = new Event({
				content: { parts: [{ text: "secret" }] },
				author: "other-agent",
			});
			vi.spyOn(event, "isFinalResponse").mockReturnValue(true);

			agent["maybeSaveOutputToState"](event);
			expect(event.actions.stateDelta).toStrictEqual({});
		});

		it("parses JSON against outputSchema and skips whitespace final chunks", async () => {
			const { z } = await import("zod");
			agent.outputKey = "result";
			agent.outputSchema = z.object({ answer: z.string() });

			const empty = new Event({
				content: { parts: [{ text: "   " }] },
				author: agent.name,
			});
			vi.spyOn(empty, "isFinalResponse").mockReturnValue(true);
			agent["maybeSaveOutputToState"](empty);
			expect(empty.actions.stateDelta).toStrictEqual({});

			const valid = new Event({
				content: { parts: [{ text: '{"answer":"ok"}' }] },
				author: agent.name,
			});
			vi.spyOn(valid, "isFinalResponse").mockReturnValue(true);
			agent["maybeSaveOutputToState"](valid);
			expect(valid.actions.stateDelta?.result).toEqual({ answer: "ok" });

			const invalid = new Event({
				content: { parts: [{ text: '{"answer":1}' }] },
				author: agent.name,
			});
			vi.spyOn(invalid, "isFinalResponse").mockReturnValue(true);
			expect(() => agent["maybeSaveOutputToState"](invalid)).toThrow(
				/Output validation failed/,
			);
		});
	});

	describe("validateOutputSchemaConfig", () => {
		it("warns when transfers, subAgents, or tools are mixed with outputSchema", async () => {
			const { z } = await import("zod");
			const schema = z.object({ value: z.string() });
			const warn = vi.fn();
			const child = new LlmAgent({ name: "child" });
			const tool = new FunctionTool(
				async function noop() {
					return "ok";
				},
				{
					description: "No-op tool used for outputSchema warning coverage",
				},
			);

			const mixed = new LlmAgent({
				name: "mixed",
				outputSchema: schema,
				subAgents: [child],
				tools: [tool],
			});
			(mixed as any).logger = { warn, debug: vi.fn(), error: vi.fn() };
			mixed["validateOutputSchemaConfig"]();

			expect(warn).toHaveBeenCalled();
			expect(
				warn.mock.calls.some((c) => String(c[0]).includes("transfer")),
			).toBe(true);
			expect(
				warn.mock.calls.some((c) => String(c[0]).includes("subAgents")),
			).toBe(true);
			expect(warn.mock.calls.some((c) => String(c[0]).includes("tools"))).toBe(
				true,
			);
		});

		it("does nothing when outputSchema is unset", () => {
			const warn = vi.fn();
			(agent as any).logger = { warn, debug: vi.fn(), error: vi.fn() };
			agent["validateOutputSchemaConfig"]();
			expect(warn).not.toHaveBeenCalled();
		});
	});

	describe("runAsyncImpl", () => {
		it("should process yielded content from the flow", async () => {
			const mockFlowRunAsync = async function* () {
				yield "Hello world";
			};
			(agent["llmFlow"] as any).runAsync.mockReturnValue(mockFlowRunAsync());

			const yieldedEvents = [];
			for await (const event of agent["runAsyncImpl"](mockContext)) {
				yieldedEvents.push(event);
			}

			expect(yieldedEvents).toHaveLength(1);
			expect(yieldedEvents[0].errorCode).toBe("AGENT_EXECUTION_ERROR");
		});

		it("should catch a non-Error object from the flow and yield a formatted error event", async () => {
			const mockFlowRunAsync = async function* () {
				yield "test";
			};
			(agent["llmFlow"] as any).runAsync.mockReturnValue(mockFlowRunAsync());

			const yieldedEvents = [];
			for await (const event of agent["runAsyncImpl"](mockContext)) {
				yieldedEvents.push(event);
			}

			expect(yieldedEvents).toHaveLength(1);
			const errorEvent = yieldedEvents[0];
			expect(errorEvent.author).toBe(agent.name);
		});
	});
});

describe("LlmAgent defaults and canonical helpers", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("defaults includeContents and disallowTransfer flags", () => {
		const agent = new LlmAgent({ name: "defaultsAgent" });
		expect(agent.includeContents).toBe("default");
		expect(agent.disallowTransferToParent).toBe(false);
		expect(agent.disallowTransferToPeers).toBe(false);
	});

	it("canonicalInstruction returns string instruction without provider flag", async () => {
		const agent = new LlmAgent({
			name: "instrAgent",
			instruction: "be helpful",
		});
		await expect(agent.canonicalInstruction({} as any)).resolves.toEqual([
			"be helpful",
			false,
		]);
	});

	it("canonicalInstruction invokes instruction provider", async () => {
		const agent = new LlmAgent({
			name: "providerAgent",
			instruction: async () => "from-provider",
		});
		await expect(agent.canonicalInstruction({} as any)).resolves.toEqual([
			"from-provider",
			true,
		]);
	});

	it("canonicalTools converts a function into FunctionTool", async () => {
		const echoTool = Object.defineProperty(
			new Function(
				'/** Echoes a fixed value for agent tool resolution tests. */ return "echo";',
			),
			"name",
			{ value: "echoTool" },
		);
		const agent = new LlmAgent({
			name: "toolsAgent",
			tools: [echoTool as () => string],
		});
		const tools = await agent.canonicalTools();
		expect(tools).toHaveLength(1);
		expect(tools[0]).toBeInstanceOf(FunctionTool);
		expect(tools[0].name).toBe("echoTool");
	});

	it("canonical before/after model and tool callbacks normalize single and array", () => {
		const beforeModel = vi.fn();
		const afterModel = vi.fn();
		const beforeTool = vi.fn();
		const afterTool = vi.fn();

		const single = new LlmAgent({
			name: "cbSingle",
			beforeModelCallback: beforeModel,
			afterModelCallback: afterModel,
			beforeToolCallback: beforeTool,
			afterToolCallback: afterTool,
		});
		expect(single.canonicalBeforeModelCallbacks).toEqual([beforeModel]);
		expect(single.canonicalAfterModelCallbacks).toEqual([afterModel]);
		expect(single.canonicalBeforeToolCallbacks).toEqual([beforeTool]);
		expect(single.canonicalAfterToolCallbacks).toEqual([afterTool]);

		const multi = new LlmAgent({
			name: "cbMulti",
			beforeModelCallback: [beforeModel, beforeModel],
			afterModelCallback: [afterModel],
			beforeToolCallback: [beforeTool, beforeTool],
			afterToolCallback: [afterTool, afterTool],
		});
		expect(multi.canonicalBeforeModelCallbacks).toHaveLength(2);
		expect(multi.canonicalAfterModelCallbacks).toHaveLength(1);
		expect(multi.canonicalBeforeToolCallbacks).toHaveLength(2);
		expect(multi.canonicalAfterToolCallbacks).toHaveLength(2);

		const empty = new LlmAgent({ name: "cbEmpty" });
		expect(empty.canonicalBeforeModelCallbacks).toEqual([]);
		expect(empty.canonicalAfterModelCallbacks).toEqual([]);
		expect(empty.canonicalBeforeToolCallbacks).toEqual([]);
		expect(empty.canonicalAfterToolCallbacks).toEqual([]);
	});

	it("llmFlow uses SingleFlow when both transfers are disallowed and there are no subAgents", () => {
		const agent = new LlmAgent({
			name: "singleFlowAgent",
			disallowTransferToParent: true,
			disallowTransferToPeers: true,
		});
		void (agent as any).llmFlow;
		expect(SingleFlow).toHaveBeenCalled();
		expect(AutoFlow).not.toHaveBeenCalled();
	});

	it("llmFlow uses AutoFlow when transfers are allowed", () => {
		const agent = new LlmAgent({ name: "autoFlowAgent" });
		void (agent as any).llmFlow;
		expect(AutoFlow).toHaveBeenCalled();
		expect(SingleFlow).not.toHaveBeenCalled();
	});

	it("llmFlow uses AutoFlow when subAgents are present even if transfers are disallowed", () => {
		const child = new LlmAgent({ name: "child" });
		const agent = new LlmAgent({
			name: "parentWithSubs",
			disallowTransferToParent: true,
			disallowTransferToPeers: true,
			subAgents: [child],
		});
		void (agent as any).llmFlow;
		expect(AutoFlow).toHaveBeenCalled();
		expect(SingleFlow).not.toHaveBeenCalled();
	});

	it("canonicalModel resolves string models via LLMRegistry", () => {
		const newLLM = vi
			.spyOn(LLMRegistry, "newLLM")
			.mockReturnValue({ model: "gemini-2.0-flash", kind: "registry" } as any);
		const agent = new LlmAgent({
			name: "modelAgent",
			model: "gemini-2.0-flash",
		});
		expect(agent.canonicalModel).toEqual({
			model: "gemini-2.0-flash",
			kind: "registry",
		});
		expect(newLLM).toHaveBeenCalledWith("gemini-2.0-flash");
		newLLM.mockRestore();
	});

	it("canonicalModel returns BaseLlm instances as-is", () => {
		class StubLlm extends BaseLlm {
			async *generateContentAsync() {
				yield { content: { role: "model", parts: [] } } as never;
			}
		}
		const model = new StubLlm("stub-model");
		const agent = new LlmAgent({ name: "baseLlmAgent", model });
		expect(agent.canonicalModel).toBe(model);
	});

	it("canonicalModel inherits from a parent LlmAgent when unset or empty", () => {
		const newLLM = vi
			.spyOn(LLMRegistry, "newLLM")
			.mockReturnValue({ model: "gpt-4o", kind: "registry" } as any);
		const parent = new LlmAgent({
			name: "parent_model",
			model: "gpt-4o",
		});
		const child = new LlmAgent({ name: "child_model" });
		parent.subAgents = [child];
		child.parentAgent = parent;

		expect(child.canonicalModel).toEqual({ model: "gpt-4o", kind: "registry" });

		const emptyChild = new LlmAgent({ name: "empty_model", model: "" });
		parent.subAgents = [child, emptyChild];
		emptyChild.parentAgent = parent;
		expect(emptyChild.canonicalModel).toEqual({
			model: "gpt-4o",
			kind: "registry",
		});
		newLLM.mockRestore();
	});

	it("canonicalModel throws when no ancestor provides a model", () => {
		const agent = new LlmAgent({ name: "orphan" });
		expect(() => agent.canonicalModel).toThrow(
			/No model found for agent "orphan"/,
		);
	});

	it("canonicalGlobalInstruction resolves string and provider forms", async () => {
		const withString = new LlmAgent({
			name: "global_str",
			globalInstruction: "shared rules",
		});
		await expect(
			withString.canonicalGlobalInstruction({} as any),
		).resolves.toEqual(["shared rules", false]);

		const withProvider = new LlmAgent({
			name: "global_fn",
			globalInstruction: async () => "from-global-provider",
		});
		await expect(
			withProvider.canonicalGlobalInstruction({} as any),
		).resolves.toEqual(["from-global-provider", true]);
	});
});
