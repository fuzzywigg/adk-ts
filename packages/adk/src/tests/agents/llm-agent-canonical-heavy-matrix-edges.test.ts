import type { LanguageModel } from "ai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BaseAgent } from "../../agents/base-agent";
import { LlmAgent } from "../../agents/llm-agent";
import type { ReadonlyContext } from "../../agents/readonly-context";
import { AiSdkLlm } from "../../models/ai-sdk";
import { BaseLlm } from "../../models/base-llm";
import { LLMRegistry } from "../../models/llm-registry";
import type { LlmRequest } from "../../models/llm-request";
import type { LlmResponse } from "../../models/llm-response";
import { FunctionTool } from "../../tools/function/function-tool";

vi.mock("@adk/helpers/logger", () => ({
	Logger: vi.fn(() => ({
		debug: vi.fn(),
		error: vi.fn(),
		warn: vi.fn(),
	})),
}));

class StubLlm extends BaseLlm {
	constructor(model = "stub-model") {
		super(model);
	}
	async *generateContentAsync() {
		yield { content: { parts: [{ text: "ok" }] } } as LlmResponse;
	}
}

class NonLlmAncestor extends BaseAgent {
	protected async *runAsyncImpl() {}
	protected async *runLiveImpl() {}
}

const readonlyCtx = {} as ReadonlyContext;

describe("LlmAgent canonical heavy matrix leftover edges", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		LLMRegistry.clear();
	});

	describe("canonicalModel matrix", () => {
		it("resolves non-empty string via LLMRegistry.newLLM", () => {
			const spy = vi
				.spyOn(LLMRegistry, "newLLM")
				.mockReturnValue(new StubLlm("gemini-2.5-flash"));
			const agent = new LlmAgent({
				name: "str_model",
				model: "gemini-2.5-flash",
			});
			expect(agent.canonicalModel).toBeInstanceOf(StubLlm);
			expect(spy).toHaveBeenCalledWith("gemini-2.5-flash");
		});

		it("returns BaseLlm instance as-is", () => {
			const llm = new StubLlm("direct");
			const agent = new LlmAgent({ name: "inst_model", model: llm });
			expect(agent.canonicalModel).toBe(llm);
		});

		it("wraps LanguageModel in AiSdkLlm", () => {
			const languageModel = {
				modelId: "mock",
				provider: "mock",
				specificationVersion: "v2",
			} as unknown as LanguageModel;
			const agent = new LlmAgent({
				name: "ai_sdk_model",
				model: languageModel,
			});
			expect(agent.canonicalModel).toBeInstanceOf(AiSdkLlm);
		});

		it("walks past non-LlmAgent ancestors to find LlmAgent model", () => {
			const root = new LlmAgent({
				name: "root_model",
				model: new StubLlm("from-root"),
			});
			const mid = new NonLlmAncestor({ name: "mid_non_llm" });
			const leaf = new LlmAgent({ name: "leaf_empty", model: "" });
			(mid as any).parentAgent = root;
			(leaf as any).parentAgent = mid;
			expect(leaf.canonicalModel).toBe(root.canonicalModel);
		});

		it("throws when empty model and no LlmAgent ancestor", () => {
			const orphan = new LlmAgent({ name: "orphan", model: "" });
			expect(() => orphan.canonicalModel).toThrow(
				/No model found for agent "orphan"/,
			);
		});

		it("inherits string model from parent LlmAgent", () => {
			vi.spyOn(LLMRegistry, "newLLM").mockImplementation(
				(model) => new StubLlm(model),
			);
			const parent = new LlmAgent({
				name: "parent_str",
				model: "parent-model",
			});
			const child = new LlmAgent({ name: "child_inherit", model: "" });
			(child as any).parentAgent = parent;
			expect(child.canonicalModel.model).toBe("parent-model");
		});
	});

	describe("canonical instruction matrices", () => {
		it.each([
			{
				label: "string instruction",
				instruction: "static",
				expected: ["static", false] as [string, boolean],
			},
			{
				label: "empty string instruction",
				instruction: "",
				expected: ["", false] as [string, boolean],
			},
		])("$label", async ({ instruction, expected }) => {
			const agent = new LlmAgent({ name: "instr_str", instruction });
			await expect(agent.canonicalInstruction(readonlyCtx)).resolves.toEqual(
				expected,
			);
		});

		it("resolves sync instruction provider", async () => {
			const agent = new LlmAgent({
				name: "instr_sync",
				instruction: () => "from-sync",
			});
			await expect(agent.canonicalInstruction(readonlyCtx)).resolves.toEqual([
				"from-sync",
				true,
			]);
		});

		it("resolves async instruction provider", async () => {
			const agent = new LlmAgent({
				name: "instr_async",
				instruction: async () => "from-async",
			});
			await expect(agent.canonicalInstruction(readonlyCtx)).resolves.toEqual([
				"from-async",
				true,
			]);
		});

		it.each([
			{
				label: "string global",
				globalInstruction: "g-static",
				expected: ["g-static", false] as [string, boolean],
			},
			{
				label: "empty global",
				globalInstruction: "",
				expected: ["", false] as [string, boolean],
			},
		])("$label", async ({ globalInstruction, expected }) => {
			const agent = new LlmAgent({ name: "ginstr_str", globalInstruction });
			await expect(
				agent.canonicalGlobalInstruction(readonlyCtx),
			).resolves.toEqual(expected);
		});

		it("resolves sync and async global instruction providers", async () => {
			const syncAgent = new LlmAgent({
				name: "ginstr_sync",
				globalInstruction: () => "g-sync",
			});
			const asyncAgent = new LlmAgent({
				name: "ginstr_async",
				globalInstruction: async () => "g-async",
			});
			await expect(
				syncAgent.canonicalGlobalInstruction(readonlyCtx),
			).resolves.toEqual(["g-sync", true]);
			await expect(
				asyncAgent.canonicalGlobalInstruction(readonlyCtx),
			).resolves.toEqual(["g-async", true]);
		});
	});

	describe("canonicalTools matrix", () => {
		function fnToolWithDoc(name: string, doc: string) {
			return Object.defineProperty(
				new Function(`/** ${doc} */ return "ok";`),
				"name",
				{ value: name },
			) as () => string;
		}

		it("converts bare functions to FunctionTool", async () => {
			const bareToolFn = fnToolWithDoc(
				"bareToolFn",
				"bare tool for canonical matrix",
			);
			const agent = new LlmAgent({ name: "tools_fn", tools: [bareToolFn] });
			const tools = await agent.canonicalTools();
			expect(tools).toHaveLength(1);
			expect(tools[0]).toBeInstanceOf(FunctionTool);
			expect(tools[0].name).toBe("bareToolFn");
		});

		it("passes BaseTool instances through", async () => {
			const tool = new FunctionTool(
				async function named() {
					return "y";
				},
				{ name: "named", description: "named tool" },
			);
			const agent = new LlmAgent({ name: "tools_base", tools: [tool] });
			const tools = await agent.canonicalTools();
			expect(tools).toEqual([tool]);
		});

		it("handles mixed list and empty defaults", async () => {
			const bareFn = fnToolWithDoc("bareFn", "bare fn for mixed tools matrix");
			const tool = new FunctionTool(
				async function mixedTool() {
					return 2;
				},
				{ name: "mixedTool", description: "mixed tool" },
			);
			const mixed = new LlmAgent({
				name: "tools_mixed",
				tools: [bareFn, tool],
			});
			const empty = new LlmAgent({ name: "tools_empty" });
			expect(await mixed.canonicalTools()).toHaveLength(2);
			expect(await empty.canonicalTools()).toEqual([]);
		});
	});

	describe("canonical callback matrices", () => {
		const beforeModel = (_args: { llmRequest: LlmRequest }) =>
			null as LlmResponse | null;
		const afterModel = () => null as LlmResponse | null;
		const beforeTool = () => null;
		const afterTool = () => null;

		it.each([
			{ field: "beforeModelCallback", getter: "canonicalBeforeModelCallbacks" },
			{ field: "afterModelCallback", getter: "canonicalAfterModelCallbacks" },
			{ field: "beforeToolCallback", getter: "canonicalBeforeToolCallbacks" },
			{ field: "afterToolCallback", getter: "canonicalAfterToolCallbacks" },
		] as const)("$field undefined → empty", ({ field, getter }) => {
			const agent = new LlmAgent({ name: `cb_${field}` });
			expect((agent as any)[getter]).toEqual([]);
		});

		it("wraps single callbacks into arrays", () => {
			const agent = new LlmAgent({
				name: "cb_single",
				beforeModelCallback: beforeModel,
				afterModelCallback: afterModel,
				beforeToolCallback: beforeTool,
				afterToolCallback: afterTool,
			});
			expect(agent.canonicalBeforeModelCallbacks).toEqual([beforeModel]);
			expect(agent.canonicalAfterModelCallbacks).toEqual([afterModel]);
			expect(agent.canonicalBeforeToolCallbacks).toEqual([beforeTool]);
			expect(agent.canonicalAfterToolCallbacks).toEqual([afterTool]);
		});

		it("returns callback arrays as-is", () => {
			const bm = [beforeModel, beforeModel];
			const am = [afterModel];
			const bt = [beforeTool, beforeTool];
			const at = [afterTool, afterTool];
			const agent = new LlmAgent({
				name: "cb_array",
				beforeModelCallback: bm,
				afterModelCallback: am,
				beforeToolCallback: bt,
				afterToolCallback: at,
			});
			expect(agent.canonicalBeforeModelCallbacks).toBe(bm);
			expect(agent.canonicalAfterModelCallbacks).toBe(am);
			expect(agent.canonicalBeforeToolCallbacks).toBe(bt);
			expect(agent.canonicalAfterToolCallbacks).toBe(at);
		});
	});
});
