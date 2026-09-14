import type { LanguageModel } from "ai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BaseAgent } from "../../agents/base-agent";
import type { InvocationContext } from "../../agents/invocation-context";
import { LlmAgent } from "../../agents/llm-agent";
import { SequentialAgent } from "../../agents/sequential-agent";
import { Event } from "../../events/event";
import { AutoFlow, SingleFlow } from "../../flows/llm-flows";
import { AiSdkLlm } from "../../models/ai-sdk";
import { BaseLlm } from "../../models/base-llm";
import { LLMRegistry } from "../../models/llm-registry";
import { BaseTool } from "../../tools/base/base-tool";
import { FunctionTool } from "../../tools/function/function-tool";
import type { ToolContext } from "../../tools/tool-context";

class StubPassthroughTool extends BaseTool {
	constructor(name = "passthrough") {
		super({ name, description: "Stub BaseTool for canonicalTools coverage" });
	}

	getDeclaration() {
		return { name: this.name, description: this.description };
	}

	async runAsync(_args: Record<string, any>, _context: ToolContext) {
		return { ok: true };
	}
}

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
		function mockFlowRunAsync(impl: () => AsyncGenerator<any, void, unknown>) {
			const runAsync = vi.fn(impl);
			(AutoFlow as any).mockImplementation(function (this: any) {
				this.runAsync = runAsync;
			});
			(SingleFlow as any).mockImplementation(function (this: any) {
				this.runAsync = runAsync;
			});
			return runAsync;
		}

		it("passes through non-Event yields when author access does not throw", async () => {
			mockFlowRunAsync(async function* () {
				yield "Hello world";
			});

			const yieldedEvents = [];
			for await (const event of agent["runAsyncImpl"](mockContext)) {
				yieldedEvents.push(event);
			}

			expect(yieldedEvents).toEqual(["Hello world"]);
		});

		it("yields multiple Event values from the flow in order", async () => {
			const first = new Event({
				author: agent.name,
				content: { parts: [{ text: "one" }] },
			});
			const second = new Event({
				author: agent.name,
				content: { parts: [{ text: "two" }] },
			});
			mockFlowRunAsync(async function* () {
				yield first;
				yield second;
			});

			const yieldedEvents = [];
			for await (const event of agent["runAsyncImpl"](mockContext)) {
				yieldedEvents.push(event);
			}

			expect(yieldedEvents).toEqual([first, second]);
		});

		it("yields Event instances from the flow and saves outputKey state", async () => {
			agent.outputKey = "answer";
			const finalEvent = new Event({
				author: agent.name,
				content: { parts: [{ text: "done" }] },
			});
			const partialEvent = new Event({
				author: agent.name,
				content: { parts: [{ text: "partial" }] },
			});
			vi.spyOn(partialEvent, "isFinalResponse").mockReturnValue(false);
			vi.spyOn(finalEvent, "isFinalResponse").mockReturnValue(true);

			mockFlowRunAsync(async function* () {
				yield partialEvent;
				yield finalEvent;
			});

			const yieldedEvents = [];
			for await (const event of agent["runAsyncImpl"](mockContext)) {
				yieldedEvents.push(event);
			}

			expect(yieldedEvents).toEqual([partialEvent, finalEvent]);
			expect(partialEvent.actions.stateDelta).toStrictEqual({});
			expect(finalEvent.actions.stateDelta?.answer).toBe("done");
		});

		it("catches thrown Error from the flow and yields AGENT_EXECUTION_ERROR", async () => {
			mockFlowRunAsync(
				// biome-ignore lint/correctness/useYield: throws before yielding
				async function* () {
					throw new Error("flow boom");
				},
			);

			const yieldedEvents = [];
			for await (const event of agent["runAsyncImpl"](mockContext)) {
				yieldedEvents.push(event);
			}

			expect(yieldedEvents).toHaveLength(1);
			expect(yieldedEvents[0].errorCode).toBe("AGENT_EXECUTION_ERROR");
			expect(yieldedEvents[0].errorMessage).toBe("flow boom");
			expect(yieldedEvents[0].content?.parts?.[0]?.text).toBe(
				"Error: flow boom",
			);
			expect(yieldedEvents[0].invocationId).toBe("test-inv-id");
			expect(yieldedEvents[0].author).toBe(agent.name);
		});

		it("stringifies non-Error throws from the flow", async () => {
			mockFlowRunAsync(
				// biome-ignore lint/correctness/useYield: throws before yielding
				async function* () {
					throw "plain-string-failure";
				},
			);

			const yieldedEvents = [];
			for await (const event of agent["runAsyncImpl"](mockContext)) {
				yieldedEvents.push(event);
			}

			expect(yieldedEvents).toHaveLength(1);
			expect(yieldedEvents[0].errorCode).toBe("AGENT_EXECUTION_ERROR");
			expect(yieldedEvents[0].errorMessage).toBe("plain-string-failure");
			expect(yieldedEvents[0].content?.parts?.[0]?.text).toBe(
				"Error: plain-string-failure",
			);
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

	it("canonicalTools passes BaseTool instances through and mixes with functions", async () => {
		const passthrough = new StubPassthroughTool("keep_me");
		const echoTool = Object.defineProperty(
			new Function(
				'/** Echoes a fixed value for mixed tool resolution tests. */ return "echo";',
			),
			"name",
			{ value: "echoTool" },
		);
		const agent = new LlmAgent({
			name: "mixed_tools",
			tools: [passthrough, echoTool as () => string],
		});
		const tools = await agent.canonicalTools();
		expect(tools).toHaveLength(2);
		expect(tools[0]).toBe(passthrough);
		expect(tools[1]).toBeInstanceOf(FunctionTool);
		expect(tools[1].name).toBe("echoTool");
	});

	it("canonicalModel wraps LanguageModel values in AiSdkLlm", () => {
		const languageModel = {
			modelId: "mock-lang-model",
			provider: "mock",
			specificationVersion: "v2",
		} as unknown as LanguageModel;
		const agent = new LlmAgent({
			name: "ai_sdk_agent",
			model: languageModel,
		});
		const resolved = agent.canonicalModel;
		expect(resolved).toBeInstanceOf(AiSdkLlm);
		expect(resolved.model).toBe("mock-lang-model");
	});

	it("canonicalModel skips non-LlmAgent ancestors when walking for inheritance", () => {
		const newLLM = vi
			.spyOn(LLMRegistry, "newLLM")
			.mockReturnValue({ model: "from-grandparent", kind: "registry" } as any);
		const grandparent = new LlmAgent({
			name: "grandparent_model",
			model: "from-grandparent",
		});
		const middle = new SequentialAgent({
			name: "middle_seq",
			description: "non-llm middle",
		});
		const child = new LlmAgent({ name: "leaf_child" });
		grandparent.subAgents = [middle];
		middle.parentAgent = grandparent;
		middle.subAgents = [child];
		child.parentAgent = middle;

		expect(child.canonicalModel).toEqual({
			model: "from-grandparent",
			kind: "registry",
		});
		newLLM.mockRestore();
	});

	it("wires includeContents, planner, plugins, and generateContentConfig from config", () => {
		const planner = { name: "stub-planner" } as any;
		const plugin = { name: "stub-plugin" } as any;
		const agent = new LlmAgent({
			name: "wired_agent",
			description: "wires optional fields",
			includeContents: "none",
			planner,
			plugins: [plugin],
			generateContentConfig: { temperature: 0.2 } as any,
			disallowTransferToParent: true,
			disallowTransferToPeers: true,
			outputKey: "out",
		});

		expect(agent.includeContents).toBe("none");
		expect(agent.planner).toBe(planner);
		expect(agent.plugins).toEqual([plugin]);
		expect(agent.generateContentConfig).toEqual({ temperature: 0.2 });
		expect(agent.disallowTransferToParent).toBe(true);
		expect(agent.disallowTransferToPeers).toBe(true);
		expect(agent.outputKey).toBe("out");
	});

	it("validateOutputSchemaConfig warns only on open transfer flags", async () => {
		const { z } = await import("zod");
		const warn = vi.fn();
		const agent = new LlmAgent({
			name: "schema_only",
			outputSchema: z.object({ value: z.string() }),
		});
		(agent as any).logger = { warn, debug: vi.fn(), error: vi.fn() };
		agent["validateOutputSchemaConfig"]();
		expect(warn).toHaveBeenCalledTimes(1);
		expect(String(warn.mock.calls[0][0])).toContain("transfer");
	});

	it("validateOutputSchemaConfig warns when only one transfer flag is open", async () => {
		const { z } = await import("zod");
		const warn = vi.fn();
		const agent = new LlmAgent({
			name: "half_open",
			outputSchema: z.object({ value: z.string() }),
			disallowTransferToParent: true,
			disallowTransferToPeers: false,
		});
		(agent as any).logger = { warn, debug: vi.fn(), error: vi.fn() };
		agent["validateOutputSchemaConfig"]();
		expect(warn).toHaveBeenCalledTimes(1);
		expect(String(warn.mock.calls[0][0])).toContain("transfer");
	});

	it("maybeSaveOutputToState stringifies non-Error schema failures", async () => {
		const agent = new LlmAgent({ name: "schema_string_fail" });
		agent.outputKey = "result";
		agent.outputSchema = {
			parse: () => {
				throw "zod-string-boom";
			},
		} as any;
		(agent as any).logger = {
			warn: vi.fn(),
			debug: vi.fn(),
			error: vi.fn(),
		};

		const event = new Event({
			content: { parts: [{ text: '{"answer":"ok"}' }] },
			author: agent.name,
		});
		vi.spyOn(event, "isFinalResponse").mockReturnValue(true);

		expect(() => agent["maybeSaveOutputToState"](event)).toThrow(
			/Output validation failed: zod-string-boom/,
		);
	});

	it("canonicalModel still throws when only non-LlmAgent ancestors exist", () => {
		class ShellAgent extends BaseAgent {
			protected async *runAsyncImpl() {}
			protected async *runLiveImpl() {}
		}
		const shell = new ShellAgent({ name: "shell_only", description: "shell" });
		const orphan = new LlmAgent({ name: "orphan_under_shell" });
		shell.subAgents = [orphan];
		orphan.parentAgent = shell;
		expect(() => orphan.canonicalModel).toThrow(
			/No model found for agent "orphan_under_shell"/,
		);
	});
});
