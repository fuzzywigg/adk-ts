import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { BaseAgent } from "../../agents/base-agent";
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
		this.runAsync = vi.fn(async function* () {});
	}),
	AutoFlow: vi.fn(function () {
		this.runAsync = vi.fn(async function* () {});
	}),
}));

class ShellAgent extends BaseAgent {
	protected async *runAsyncImpl() {}
	protected async *runLiveImpl() {}
}

class StubLlm extends BaseLlm {
	async *generateContentAsync() {
		yield { content: { parts: [{ text: "stub" }] } } as any;
	}
	connect() {
		return {} as any;
	}
}

const mockContext: InvocationContext = {
	invocationId: "fourth-llm-inv",
	agent: {} as any,
	branch: undefined,
	session: {
		id: "ses-fourth",
		userId: "user-fourth",
		appName: "app-fourth",
		state: {},
		events: [],
		lastUpdateTime: 0,
	} as any,
	endInvocation: false,
	createChildContext: vi.fn(),
} as unknown as InvocationContext;

function attachWarn(agent: LlmAgent) {
	const warn = vi.fn();
	(agent as any).logger = { warn, debug: vi.fn(), error: vi.fn() };
	return warn;
}

describe("LlmAgent fourth leftover edges — outputSchema transfer matrices", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	const transferMatrix: Array<{
		label: string;
		parent: boolean;
		peers: boolean;
		expectTransferWarn: boolean;
	}> = [
		{
			label: "both disallowed",
			parent: true,
			peers: true,
			expectTransferWarn: false,
		},
		{
			label: "parent allowed peers locked",
			parent: false,
			peers: true,
			expectTransferWarn: true,
		},
		{
			label: "parent locked peers allowed",
			parent: true,
			peers: false,
			expectTransferWarn: true,
		},
		{
			label: "both allowed",
			parent: false,
			peers: false,
			expectTransferWarn: true,
		},
		{
			label: "defaults (both false via ||)",
			parent: undefined as unknown as boolean,
			peers: undefined as unknown as boolean,
			expectTransferWarn: true,
		},
	];

	for (const row of transferMatrix) {
		it(`transfer warn matrix: ${row.label}`, () => {
			const agent = new LlmAgent({
				name: `xfer_${row.label.replace(/\W+/g, "_")}`,
				outputSchema: z.object({ v: z.string() }),
				disallowTransferToParent: row.parent,
				disallowTransferToPeers: row.peers,
			});
			const warn = attachWarn(agent);
			agent["validateOutputSchemaConfig"]();
			const transferHit = warn.mock.calls.some((c) =>
				String(c[0]).includes("transfer flags allow transfers"),
			);
			expect(transferHit).toBe(row.expectTransferWarn);
		});
	}

	it("warns for subAgents only when schema set and length > 0", () => {
		const child = new LlmAgent({ name: "child_fourth" });
		const withSubs = new LlmAgent({
			name: "with_subs",
			outputSchema: z.object({ a: z.number() }),
			disallowTransferToParent: true,
			disallowTransferToPeers: true,
			subAgents: [child],
		});
		const warnSubs = attachWarn(withSubs);
		withSubs["validateOutputSchemaConfig"]();
		expect(
			warnSubs.mock.calls.some((c) => String(c[0]).includes("subAgents")),
		).toBe(true);

		const emptySubs = new LlmAgent({
			name: "empty_subs",
			outputSchema: z.object({ a: z.number() }),
			disallowTransferToParent: true,
			disallowTransferToPeers: true,
			subAgents: [],
		});
		const warnEmpty = attachWarn(emptySubs);
		emptySubs["validateOutputSchemaConfig"]();
		expect(
			warnEmpty.mock.calls.some((c) => String(c[0]).includes("subAgents")),
		).toBe(false);
	});

	it("warns for tools only when schema set and tools length > 0", () => {
		const tool = new FunctionTool(
			async function noop() {
				return "ok";
			},
			{ description: "noop tool for schema warning matrix" },
		);
		const withTools = new LlmAgent({
			name: "with_tools",
			outputSchema: z.object({ a: z.string() }),
			disallowTransferToParent: true,
			disallowTransferToPeers: true,
			tools: [tool],
		});
		const warnTools = attachWarn(withTools);
		withTools["validateOutputSchemaConfig"]();
		expect(
			warnTools.mock.calls.some((c) => String(c[0]).includes("tools")),
		).toBe(true);

		const noTools = new LlmAgent({
			name: "no_tools",
			outputSchema: z.object({ a: z.string() }),
			disallowTransferToParent: true,
			disallowTransferToPeers: true,
			tools: [],
		});
		const warnNone = attachWarn(noTools);
		noTools["validateOutputSchemaConfig"]();
		expect(
			warnNone.mock.calls.some((c) => String(c[0]).includes("tools")),
		).toBe(false);
	});

	it("emits all three warnings when mixed mode is fully open", () => {
		const child = new LlmAgent({ name: "mixed_child" });
		const tool = new FunctionTool(
			async function t() {
				return 1;
			},
			{ description: "mixed open transfer warning tool" },
		);
		const agent = new LlmAgent({
			name: "mixed_open",
			outputSchema: z.object({ x: z.boolean() }),
			disallowTransferToParent: false,
			disallowTransferToPeers: false,
			subAgents: [child],
			tools: [tool],
		});
		const warn = attachWarn(agent);
		agent["validateOutputSchemaConfig"]();
		expect(warn).toHaveBeenCalledTimes(3);
	});

	it("skips validateOutputSchemaConfig entirely when outputSchema is absent", () => {
		const agent = new LlmAgent({
			name: "no_schema",
			tools: [
				new FunctionTool(
					async function t() {
						return 1;
					},
					{ description: "tool present without output schema" },
				),
			],
			subAgents: [new LlmAgent({ name: "orphan_child" })],
		});
		const warn = attachWarn(agent);
		agent["validateOutputSchemaConfig"]();
		expect(warn).not.toHaveBeenCalled();
	});
});

describe("LlmAgent fourth leftover edges — canonical model/tools coalesce", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.restoreAllMocks();
	});

	it("coalesces omitted model to empty string", () => {
		const agent = new LlmAgent({ name: "empty_model" });
		expect(agent.model).toBe("");
	});

	it("coalesces undefined model to empty string", () => {
		const agent = new LlmAgent({
			name: "undef_model",
			model: undefined,
		});
		expect(agent.model).toBe("");
	});

	it("preserves non-empty string model", () => {
		const agent = new LlmAgent({
			name: "str_model",
			model: "gemini-2.5-flash",
		});
		expect(agent.model).toBe("gemini-2.5-flash");
	});

	it("canonicalModel resolves non-empty string via LLMRegistry", () => {
		const spy = vi
			.spyOn(LLMRegistry, "newLLM")
			.mockReturnValue({ model: "gemini-2.5-flash" } as any);
		const agent = new LlmAgent({
			name: "canon_str",
			model: "gemini-2.5-flash",
		});
		expect(agent.canonicalModel).toEqual({ model: "gemini-2.5-flash" });
		expect(spy).toHaveBeenCalledWith("gemini-2.5-flash");
	});

	it("canonicalModel returns BaseLlm instance without registry", () => {
		const llm = new StubLlm("stub-model");
		const agent = new LlmAgent({ name: "canon_inst", model: llm as any });
		expect(agent.canonicalModel).toBe(llm);
	});

	it("canonicalModel inherits from nearest LlmAgent ancestor", () => {
		vi.spyOn(LLMRegistry, "newLLM").mockReturnValue({
			model: "parent-model",
		} as any);
		const parent = new LlmAgent({
			name: "parent_llm",
			model: "parent-model",
		});
		const mid = new ShellAgent({ name: "mid_shell", description: "" });
		const child = new LlmAgent({ name: "child_inherit" });
		(mid as any).parentAgent = parent;
		(child as any).parentAgent = mid;
		expect(child.canonicalModel).toEqual({ model: "parent-model" });
	});

	it("canonicalModel throws when empty and no LlmAgent ancestor", () => {
		const shell = new ShellAgent({ name: "shell_only", description: "" });
		const orphan = new LlmAgent({ name: "orphan_empty" });
		(orphan as any).parentAgent = shell;
		expect(() => orphan.canonicalModel).toThrow(/No model found/);
	});

	it("canonicalTools returns empty array when tools coalesced to []", async () => {
		const agent = new LlmAgent({ name: "tools_empty" });
		await expect(agent.canonicalTools()).resolves.toEqual([]);
	});

	it("canonicalTools wraps functions and passes BaseTool through", async () => {
		const wrapped = new FunctionTool(
			async function wrappedFn() {
				return "x";
			},
			{ description: "wrapped function tool for canonical tools matrix" },
		);
		const base = new FunctionTool(
			async function baseFn() {
				return "y";
			},
			{ description: "base function tool already constructed" },
		);
		const agent = new LlmAgent({
			name: "tools_mix",
			tools: [wrapped, base],
		});
		const tools = await agent.canonicalTools();
		expect(tools).toHaveLength(2);
		expect(tools[0]).toBe(wrapped);
		expect(tools[1]).toBe(base);
	});

	it("canonicalInstruction returns [string, false] for plain strings", async () => {
		const agent = new LlmAgent({
			name: "instr_str",
			instruction: "be helpful",
		});
		await expect(agent.canonicalInstruction({} as any)).resolves.toEqual([
			"be helpful",
			false,
		]);
	});

	it("canonicalInstruction returns [value, true] for provider functions", async () => {
		const agent = new LlmAgent({
			name: "instr_fn",
			instruction: async () => "dynamic",
		});
		await expect(agent.canonicalInstruction({} as any)).resolves.toEqual([
			"dynamic",
			true,
		]);
	});

	it("canonicalGlobalInstruction mirrors string vs provider coalesce", async () => {
		const strAgent = new LlmAgent({
			name: "glob_str",
			globalInstruction: "global",
		});
		await expect(
			strAgent.canonicalGlobalInstruction({} as any),
		).resolves.toEqual(["global", false]);

		const fnAgent = new LlmAgent({
			name: "glob_fn",
			globalInstruction: () => "glob-dyn",
		});
		await expect(
			fnAgent.canonicalGlobalInstruction({} as any),
		).resolves.toEqual(["glob-dyn", true]);
	});

	it("canonical callback getters wrap single and array forms", () => {
		const single = () => undefined;
		const agent = new LlmAgent({
			name: "cb_canon",
			beforeModelCallback: single as any,
			afterModelCallback: [single, single] as any,
			beforeToolCallback: single as any,
			afterToolCallback: [single] as any,
		});
		expect(agent.canonicalBeforeModelCallbacks).toEqual([single]);
		expect(agent.canonicalAfterModelCallbacks).toHaveLength(2);
		expect(agent.canonicalBeforeToolCallbacks).toEqual([single]);
		expect(agent.canonicalAfterToolCallbacks).toEqual([single]);
	});

	it("canonical callback getters return [] when callbacks omitted", () => {
		const agent = new LlmAgent({ name: "cb_empty" });
		expect(agent.canonicalBeforeModelCallbacks).toEqual([]);
		expect(agent.canonicalAfterModelCallbacks).toEqual([]);
		expect(agent.canonicalBeforeToolCallbacks).toEqual([]);
		expect(agent.canonicalAfterToolCallbacks).toEqual([]);
	});

	it("coalesces disallowTransfer flags via || false", () => {
		const agent = new LlmAgent({ name: "flags_default" });
		expect(agent.disallowTransferToParent).toBe(false);
		expect(agent.disallowTransferToPeers).toBe(false);
	});

	it("coalesces includeContents to default when omitted", () => {
		expect(new LlmAgent({ name: "inc_def" }).includeContents).toBe("default");
		expect(
			new LlmAgent({ name: "inc_none", includeContents: "none" })
				.includeContents,
		).toBe("none");
	});

	it("selects SingleFlow vs AutoFlow from transfer lock and subAgents", () => {
		const locked = new LlmAgent({
			name: "locked_single",
			disallowTransferToParent: true,
			disallowTransferToPeers: true,
		});
		expect(locked["llmFlow"]).toBeInstanceOf(SingleFlow);

		const unlocked = new LlmAgent({ name: "unlocked_auto" });
		expect(unlocked["llmFlow"]).toBeInstanceOf(AutoFlow);

		const child = new ShellAgent({ name: "flow_child", description: "" });
		const lockedWithSubs = new LlmAgent({
			name: "locked_with_subs",
			disallowTransferToParent: true,
			disallowTransferToPeers: true,
			subAgents: [child],
		});
		expect(lockedWithSubs["llmFlow"]).toBeInstanceOf(AutoFlow);
	});

	it("runAsyncImpl saves output then yields flow events", async () => {
		const runAsync = vi.fn(async function* () {
			const event = new Event({
				author: "save_flow",
				content: { parts: [{ text: "saved" }] },
			});
			vi.spyOn(event, "isFinalResponse").mockReturnValue(true);
			yield event;
		});
		(AutoFlow as any).mockImplementation(function (this: any) {
			this.runAsync = runAsync;
		});
		const agent = new LlmAgent({
			name: "save_flow",
			outputKey: "out",
		});
		(agent as any).logger = { debug: vi.fn(), error: vi.fn(), warn: vi.fn() };

		const events: Event[] = [];
		for await (const event of agent["runAsyncImpl"](mockContext)) {
			events.push(event);
		}
		expect(events).toHaveLength(1);
		expect(events[0].actions.stateDelta?.out).toBe("saved");
	});
});
