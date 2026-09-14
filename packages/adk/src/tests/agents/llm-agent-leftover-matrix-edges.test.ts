import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { BaseAgent } from "../../agents/base-agent";
import type { InvocationContext } from "../../agents/invocation-context";
import { LlmAgent } from "../../agents/llm-agent";
import { Event } from "../../events/event";
import { AutoFlow, SingleFlow } from "../../flows/llm-flows";
import { LLMRegistry } from "../../models/llm-registry";
import { FunctionTool } from "../../tools/function/function-tool";

vi.mock("@adk/helpers/logger", () => ({
	Logger: vi.fn(() => ({
		debug: vi.fn(),
		error: vi.fn(),
		warn: vi.fn(),
	})),
}));

vi.mock("@adk/logger", () => ({
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
	invocationId: "llm-matrix-inv",
	agent: {} as any,
	branch: [],
	session: {
		id: "ses-matrix",
		userId: "user-matrix",
		appName: "matrix-app",
		state: {},
		events: [],
		lastUpdateTime: 0,
	} as any,
	endInvocation: false,
	createChildContext: vi.fn(),
} as unknown as InvocationContext;

class ShellAgent extends BaseAgent {
	protected async *runAsyncImpl() {}
	protected async *runLiveImpl() {}
}

describe("LlmAgent leftover matrix edges (TOKENMAXX deepen)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("constructor || defaults coalesce matrix", () => {
		it.each([
			{
				label: "all omitted → empty model/instruction/global + tools []",
				config: { name: "omit_all" },
				expectModel: "",
				expectInstruction: "",
				expectGlobal: "",
				expectTools: [],
				expectParent: false,
				expectPeers: false,
				expectContents: "default",
			},
			{
				label: "empty-string model/instruction/global stay empty",
				config: {
					name: "empty_strs",
					model: "",
					instruction: "",
					globalInstruction: "",
				},
				expectModel: "",
				expectInstruction: "",
				expectGlobal: "",
				expectTools: [],
				expectParent: false,
				expectPeers: false,
				expectContents: "default",
			},
			{
				label: "includeContents empty string coalesces to default",
				config: {
					name: "contents_empty",
					includeContents: "" as any,
				},
				expectModel: "",
				expectInstruction: "",
				expectGlobal: "",
				expectTools: [],
				expectParent: false,
				expectPeers: false,
				expectContents: "default",
			},
			{
				label: "includeContents none preserved",
				config: {
					name: "contents_none",
					includeContents: "none" as const,
				},
				expectModel: "",
				expectInstruction: "",
				expectGlobal: "",
				expectTools: [],
				expectParent: false,
				expectPeers: false,
				expectContents: "none",
			},
			{
				label: "disallow flags false stay false; tools undefined → []",
				config: {
					name: "flags_false",
					disallowTransferToParent: false,
					disallowTransferToPeers: false,
					tools: undefined,
				},
				expectModel: "",
				expectInstruction: "",
				expectGlobal: "",
				expectTools: [],
				expectParent: false,
				expectPeers: false,
				expectContents: "default",
			},
			{
				label: "disallow flags true preserved",
				config: {
					name: "flags_true",
					disallowTransferToParent: true,
					disallowTransferToPeers: true,
				},
				expectModel: "",
				expectInstruction: "",
				expectGlobal: "",
				expectTools: [],
				expectParent: true,
				expectPeers: true,
				expectContents: "default",
			},
		])("$label", ({
			config,
			expectModel,
			expectInstruction,
			expectGlobal,
			expectTools,
			expectParent,
			expectPeers,
			expectContents,
		}) => {
			const agent = new LlmAgent(config as any);
			expect(agent.model).toBe(expectModel);
			expect(agent.instruction).toBe(expectInstruction);
			expect(agent.globalInstruction).toBe(expectGlobal);
			expect(agent.tools).toEqual(expectTools);
			expect(agent.disallowTransferToParent).toBe(expectParent);
			expect(agent.disallowTransferToPeers).toBe(expectPeers);
			expect(agent.includeContents).toBe(expectContents);
		});

		it("preserves non-empty model/instruction/tools when provided", () => {
			const tool = new FunctionTool(
				async function probe() {
					return "ok";
				},
				{ description: "Probe tool for populated agent" },
			);
			const agent = new LlmAgent({
				name: "populated",
				model: "gemini-2.5-flash",
				instruction: "do things",
				globalInstruction: "global",
				tools: [tool],
				includeContents: "default",
			});
			expect(agent.model).toBe("gemini-2.5-flash");
			expect(agent.instruction).toBe("do things");
			expect(agent.globalInstruction).toBe("global");
			expect(agent.tools).toEqual([tool]);
		});
	});

	describe('part.text || "" when saving output', () => {
		it.each([
			{
				label: "null text coalesces away",
				parts: [{ text: null as any }, { text: "kept" }],
				expected: "kept",
			},
			{
				label: "undefined text coalesces away",
				parts: [{ text: undefined as any }, { text: "x" }, { text: "y" }],
				expected: "xy",
			},
			{
				label: "empty text parts contribute empty segments",
				parts: [{ text: "" }, { text: "mid" }, { text: "" }],
				expected: "mid",
			},
			{
				label: "all empty/null → no state write (falsy result)",
				parts: [{ text: "" }, { text: null as any }],
				expected: undefined,
			},
		])("$label", ({ parts, expected }) => {
			const agent = new LlmAgent({ name: "save_parts", outputKey: "out" });
			const event = new Event({
				author: agent.name,
				content: { parts },
			});
			vi.spyOn(event, "isFinalResponse").mockReturnValue(true);
			agent["maybeSaveOutputToState"](event);
			expect(event.actions.stateDelta?.out).toBe(expected);
		});
	});

	describe("validateOutputSchemaConfig warn matrix", () => {
		it("does not warn when outputSchema is absent regardless of tools/subs/flags", () => {
			const warn = vi.fn();
			const child = new LlmAgent({ name: "child_no_schema" });
			const tool = new FunctionTool(
				async function t() {
					return 1;
				},
				{ description: "Tiny tool for no-schema warn check" },
			);
			const agent = new LlmAgent({
				name: "no_schema",
				tools: [tool],
				subAgents: [child],
				disallowTransferToParent: false,
				disallowTransferToPeers: false,
			});
			(agent as any).logger = { warn, debug: vi.fn(), error: vi.fn() };
			agent["validateOutputSchemaConfig"]();
			expect(warn).not.toHaveBeenCalled();
		});

		it.each([
			{
				label: "locked transfers + no tools/subs → no warnings",
				config: {
					name: "locked_clean",
					disallowTransferToParent: true,
					disallowTransferToPeers: true,
				},
				expectTransfer: false,
				expectSubs: false,
				expectTools: false,
			},
			{
				label: "open transfers only → transfer warn",
				config: {
					name: "open_only",
					disallowTransferToParent: false,
					disallowTransferToPeers: false,
				},
				expectTransfer: true,
				expectSubs: false,
				expectTools: false,
			},
			{
				label: "locked + empty subAgents array does not warn about subs",
				config: {
					name: "empty_subs",
					disallowTransferToParent: true,
					disallowTransferToPeers: true,
					subAgents: [],
				},
				expectTransfer: false,
				expectSubs: false,
				expectTools: false,
			},
			{
				label: "locked + tools only → tools warn",
				config: {
					name: "tools_only",
					disallowTransferToParent: true,
					disallowTransferToPeers: true,
					tools: [
						new FunctionTool(
							async function only() {
								return "x";
							},
							{ description: "Only tool for locked schema warn" },
						),
					],
				},
				expectTransfer: false,
				expectSubs: false,
				expectTools: true,
			},
			{
				label: "locked + subAgents only → subs warn",
				config: {
					name: "subs_only",
					disallowTransferToParent: true,
					disallowTransferToPeers: true,
					subAgents: [new LlmAgent({ name: "only_child" })],
				},
				expectTransfer: false,
				expectSubs: true,
				expectTools: false,
			},
			{
				label: "all mixed → three warn categories",
				config: {
					name: "all_mixed",
					disallowTransferToParent: false,
					disallowTransferToPeers: true,
					subAgents: [new LlmAgent({ name: "mix_child" })],
					tools: [
						new FunctionTool(
							async function mix() {
								return "y";
							},
							{ description: "Mixed tools warn matrix helper" },
						),
					],
				},
				expectTransfer: true,
				expectSubs: true,
				expectTools: true,
			},
		])("$label", ({ config, expectTransfer, expectSubs, expectTools }) => {
			const warn = vi.fn();
			const agent = new LlmAgent({
				...config,
				outputSchema: z.object({ v: z.string() }),
			} as any);
			(agent as any).logger = { warn, debug: vi.fn(), error: vi.fn() };
			agent["validateOutputSchemaConfig"]();

			const messages = warn.mock.calls.map((c) => String(c[0]));
			expect(
				messages.some((m) => m.includes("transfer flags allow transfers")),
			).toBe(expectTransfer);
			expect(messages.some((m) => m.includes("subAgents are present"))).toBe(
				expectSubs,
			);
			expect(messages.some((m) => m.includes("tools are configured"))).toBe(
				expectTools,
			);
		});
	});

	describe("runAsyncImpl Error vs non-Error String wrap matrix", () => {
		it.each([
			{
				label: "Error instance uses .message",
				throwValue: new Error("err-message"),
				expected: "err-message",
			},
			{
				label: "string throw uses String(error)",
				throwValue: "plain-string",
				expected: "plain-string",
			},
			{
				label: "number throw uses String(error)",
				throwValue: 404,
				expected: "404",
			},
			{
				label: "object throw uses String(error)",
				throwValue: { reason: "nope" },
				expected: "[object Object]",
			},
			{
				label: "boolean throw uses String(error)",
				throwValue: false,
				expected: "false",
			},
		])("$label", async ({ throwValue, expected }) => {
			const runAsync = vi.fn(
				// biome-ignore lint/correctness/useYield: throws before yielding
				async function* () {
					throw throwValue;
				},
			);
			(AutoFlow as any).mockImplementation(function (this: any) {
				this.runAsync = runAsync;
			});

			const agent = new LlmAgent({ name: "throw_matrix" });
			(agent as any).logger = {
				debug: vi.fn(),
				error: vi.fn(),
				warn: vi.fn(),
			};

			const yielded: Event[] = [];
			for await (const event of agent["runAsyncImpl"](mockContext)) {
				yielded.push(event);
			}

			expect(yielded).toHaveLength(1);
			expect(yielded[0].errorCode).toBe("AGENT_EXECUTION_ERROR");
			expect(yielded[0].errorMessage).toBe(expected);
			expect(yielded[0].content?.parts?.[0]?.text).toBe(`Error: ${expected}`);
		});
	});

	describe("canonicalModel ancestor walk throws", () => {
		it("throws when model is empty and no LlmAgent ancestors exist", () => {
			const orphan = new LlmAgent({ name: "orphan_matrix", model: "" });
			expect(() => orphan.canonicalModel).toThrow(
				/No model found for agent "orphan_matrix"/,
			);
		});

		it("walks past nested ShellAgent ancestors then throws if none provide model", () => {
			const leaf = new LlmAgent({ name: "deep_leaf", model: "" });
			const mid = new ShellAgent({ name: "shell_mid", description: "" });
			const root = new ShellAgent({
				name: "shell_root",
				description: "",
				subAgents: [mid],
			});
			mid.subAgents.push(leaf);
			leaf.parentAgent = mid;
			mid.parentAgent = root;

			expect(() => leaf.canonicalModel).toThrow(
				/No model found for agent "deep_leaf"/,
			);
		});

		it("inherits across nested ShellAgents from a distant LlmAgent ancestor", () => {
			const registrySpy = vi
				.spyOn(LLMRegistry, "newLLM")
				.mockReturnValue({ model: "ancestor-model" } as any);

			const parent = new LlmAgent({
				name: "distant_parent",
				model: "gemini-2.5-flash",
			});
			const shell = new ShellAgent({ name: "shell_bridge", description: "" });
			const child = new LlmAgent({ name: "bridged_child", model: "" });
			shell.parentAgent = parent;
			child.parentAgent = shell;

			expect(child.canonicalModel).toEqual({ model: "ancestor-model" });
			registrySpy.mockRestore();
		});

		it("uses AutoFlow when either transfer flag is open", () => {
			const agent = new LlmAgent({
				name: "auto_open",
				disallowTransferToParent: false,
				disallowTransferToPeers: true,
			});
			expect(agent["llmFlow"]).toBeInstanceOf(AutoFlow);
		});

		it("uses SingleFlow only when both locked and no subAgents", () => {
			const agent = new LlmAgent({
				name: "single_locked",
				disallowTransferToParent: true,
				disallowTransferToPeers: true,
				subAgents: [],
			});
			expect(agent["llmFlow"]).toBeInstanceOf(SingleFlow);
		});
	});
});
