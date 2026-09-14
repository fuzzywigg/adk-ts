import { beforeEach, describe, expect, it, vi } from "vitest";
import { BaseAgent } from "../../agents/base-agent";
import type { InvocationContext } from "../../agents/invocation-context";
import { LlmAgent } from "../../agents/llm-agent";
import { Event } from "../../events/event";
import { AutoFlow, SingleFlow } from "../../flows/llm-flows";
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

describe("LlmAgent leftover edges (post #113/#118)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("does not warn about transfers when both disallow flags are true", async () => {
		const { z } = await import("zod");
		const warn = vi.fn();
		const child = new LlmAgent({ name: "child_edge" });
		const tool = new FunctionTool(
			async function noop() {
				return "ok";
			},
			{ description: "noop" },
		);
		const agent = new LlmAgent({
			name: "locked_schema",
			outputSchema: z.object({ value: z.string() }),
			disallowTransferToParent: true,
			disallowTransferToPeers: true,
			subAgents: [child],
			tools: [tool],
		});
		(agent as any).logger = { warn, debug: vi.fn(), error: vi.fn() };
		agent["validateOutputSchemaConfig"]();

		expect(
			warn.mock.calls.some((c) =>
				String(c[0]).includes("transfer flags allow transfers"),
			),
		).toBe(false);
		expect(
			warn.mock.calls.some((c) => String(c[0]).includes("subAgents")),
		).toBe(true);
		expect(warn.mock.calls.some((c) => String(c[0]).includes("tools"))).toBe(
			true,
		);
	});

	it("warns about transfers when only parent transfers are allowed", async () => {
		const { z } = await import("zod");
		const warn = vi.fn();
		const agent = new LlmAgent({
			name: "parent_open",
			outputSchema: z.object({ value: z.string() }),
			disallowTransferToParent: false,
			disallowTransferToPeers: true,
		});
		(agent as any).logger = { warn, debug: vi.fn(), error: vi.fn() };
		agent["validateOutputSchemaConfig"]();
		expect(String(warn.mock.calls[0][0])).toContain("transfer");
	});

	it("warns about transfers when only peer transfers are allowed", async () => {
		const { z } = await import("zod");
		const warn = vi.fn();
		const agent = new LlmAgent({
			name: "peer_open",
			outputSchema: z.object({ value: z.string() }),
			disallowTransferToParent: true,
			disallowTransferToPeers: false,
		});
		(agent as any).logger = { warn, debug: vi.fn(), error: vi.fn() };
		agent["validateOutputSchemaConfig"]();
		expect(String(warn.mock.calls[0][0])).toContain("transfer");
	});

	it("wraps non-Error schema failures with String(error)", async () => {
		const { z } = await import("zod");
		const agent = new LlmAgent({
			name: "schema_non_error",
			outputKey: "out",
			outputSchema: z.object({ answer: z.string() }),
		});
		(agent as any).logger = {
			warn: vi.fn(),
			debug: vi.fn(),
			error: vi.fn(),
		};
		const schema = {
			parse: () => {
				throw "boom-string";
			},
		};
		(agent as any).outputSchema = schema;

		const event = new Event({
			author: agent.name,
			content: { parts: [{ text: '{"answer":"x"}' }] },
		});
		vi.spyOn(event, "isFinalResponse").mockReturnValue(true);
		expect(() => agent["maybeSaveOutputToState"](event)).toThrow(
			/Output validation failed: boom-string/,
		);
	});

	it("joins multi-part JSON before schema parse", async () => {
		const { z } = await import("zod");
		const agent = new LlmAgent({
			name: "schema_join",
			outputKey: "out",
			outputSchema: z.object({ a: z.number() }),
		});
		const event = new Event({
			author: agent.name,
			content: { parts: [{ text: '{"a":' }, { text: "1}" }] },
		});
		vi.spyOn(event, "isFinalResponse").mockReturnValue(true);
		agent["maybeSaveOutputToState"](event);
		expect(event.actions.stateDelta?.out).toEqual({ a: 1 });
	});

	it("treats undefined part.text as empty when joining", async () => {
		const agent = new LlmAgent({
			name: "join_undef",
			outputKey: "out",
		});
		const event = new Event({
			author: agent.name,
			content: {
				parts: [{ text: undefined as any }, { text: "kept" }],
			},
		});
		vi.spyOn(event, "isFinalResponse").mockReturnValue(true);
		agent["maybeSaveOutputToState"](event);
		expect(event.actions.stateDelta?.out).toBe("kept");
	});

	it("skips state write when joined output is empty string without schema", () => {
		const agent = new LlmAgent({
			name: "empty_out",
			outputKey: "out",
		});
		const event = new Event({
			author: agent.name,
			content: { parts: [{ text: "" }] },
		});
		vi.spyOn(event, "isFinalResponse").mockReturnValue(true);
		agent["maybeSaveOutputToState"](event);
		expect(event.actions.stateDelta?.out).toBeUndefined();
	});

	it("returns early on whitespace-only final chunks when outputSchema is set", async () => {
		const { z } = await import("zod");
		const agent = new LlmAgent({
			name: "ws_schema",
			outputKey: "out",
			outputSchema: z.object({ a: z.number() }),
		});
		const event = new Event({
			author: agent.name,
			content: { parts: [{ text: "   \n" }] },
		});
		vi.spyOn(event, "isFinalResponse").mockReturnValue(true);
		agent["maybeSaveOutputToState"](event);
		expect(event.actions.stateDelta?.out).toBeUndefined();
	});

	it("yields prior flow events then AGENT_EXECUTION_ERROR when the flow throws", async () => {
		const runAsync = vi.fn(async function* () {
			yield new Event({
				author: "flow_agent",
				content: { parts: [{ text: "ok" }] },
			});
			throw new Error("flow boom");
		});
		(AutoFlow as any).mockImplementation(function (this: any) {
			this.runAsync = runAsync;
		});
		(SingleFlow as any).mockImplementation(function (this: any) {
			this.runAsync = runAsync;
		});

		const agent = new LlmAgent({ name: "flow_agent" });
		(agent as any).logger = {
			debug: vi.fn(),
			error: vi.fn(),
			warn: vi.fn(),
		};

		const yielded: Event[] = [];
		for await (const event of agent["runAsyncImpl"](mockContext)) {
			yielded.push(event);
		}

		expect(yielded).toHaveLength(2);
		expect(yielded[0].content?.parts?.[0]?.text).toBe("ok");
		expect(yielded[1].errorCode).toBe("AGENT_EXECUTION_ERROR");
		expect(yielded[1].errorMessage).toBe("flow boom");
	});

	it("wraps non-Error flow throws in AGENT_EXECUTION_ERROR events", async () => {
		const runAsync = vi.fn(
			// biome-ignore lint/correctness/useYield: throws before yielding
			async function* () {
				throw "string-fail";
			},
		);
		(AutoFlow as any).mockImplementation(function (this: any) {
			this.runAsync = runAsync;
		});

		const agent = new LlmAgent({ name: "string_fail_agent" });
		(agent as any).logger = {
			debug: vi.fn(),
			error: vi.fn(),
			warn: vi.fn(),
		};

		const yielded: Event[] = [];
		for await (const event of agent["runAsyncImpl"](mockContext)) {
			yielded.push(event);
		}
		expect(yielded[0].errorCode).toBe("AGENT_EXECUTION_ERROR");
		expect(yielded[0].content?.parts?.[0]?.text).toContain("string-fail");
	});

	it("defaults omitted instruction/globalInstruction/tools to empty values", () => {
		const agent = new LlmAgent({ name: "defaults_agent" });
		expect(agent.instruction).toBe("");
		expect(agent.globalInstruction).toBe("");
		expect(agent.tools).toEqual([]);
	});

	it("uses SingleFlow when transfers are locked and there are no subAgents", () => {
		const agent = new LlmAgent({
			name: "single_flow_agent",
			disallowTransferToParent: true,
			disallowTransferToPeers: true,
		});
		expect(agent["llmFlow"]).toBeInstanceOf(SingleFlow);
	});

	it("uses AutoFlow when subAgents exist even if transfers are locked", () => {
		class Shell extends BaseAgent {
			protected async *runAsyncImpl() {}
			protected async *runLiveImpl() {}
		}
		const child = new Shell({ name: "child_shell", description: "" });
		const agent = new LlmAgent({
			name: "auto_with_subs",
			disallowTransferToParent: true,
			disallowTransferToPeers: true,
			subAgents: [child],
		});
		expect(agent["llmFlow"]).toBeInstanceOf(AutoFlow);
	});

	it("skips output save when event author differs from the agent name", () => {
		const agent = new LlmAgent({ name: "owner", outputKey: "out" });
		const debug = vi.fn();
		(agent as any).logger = { debug, error: vi.fn(), warn: vi.fn() };
		const event = new Event({
			author: "other",
			content: { parts: [{ text: "x" }] },
		});
		vi.spyOn(event, "isFinalResponse").mockReturnValue(true);
		agent["maybeSaveOutputToState"](event);
		expect(event.actions.stateDelta?.out).toBeUndefined();
		expect(debug).toHaveBeenCalled();
	});

	it("initializes stateDelta map when missing before writing outputKey", () => {
		const agent = new LlmAgent({ name: "delta_init", outputKey: "out" });
		const event = new Event({
			author: agent.name,
			content: { parts: [{ text: "value" }] },
		});
		vi.spyOn(event, "isFinalResponse").mockReturnValue(true);
		(event.actions as any).stateDelta = undefined;
		agent["maybeSaveOutputToState"](event);
		expect(event.actions.stateDelta?.out).toBe("value");
	});
});
