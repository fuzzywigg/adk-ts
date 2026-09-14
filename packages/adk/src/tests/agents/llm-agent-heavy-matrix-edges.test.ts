import { beforeEach, describe, expect, it, vi } from "vitest";
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
	invocationId: "heavy-llm-inv",
	agent: {} as any,
	branch: "",
	session: {
		id: "ses-heavy",
		userId: "user-heavy",
		appName: "heavy-app",
		state: {},
		events: [],
		lastUpdateTime: 0,
	} as any,
	endInvocation: false,
	createChildContext: vi.fn(),
} as unknown as InvocationContext;

function makeTool() {
	return new FunctionTool(
		async function noop() {
			return "ok";
		},
		{ description: "noop" },
	);
}

describe("LlmAgent heavy matrix leftover edges", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("validateOutputSchemaConfig warn matrix", () => {
		const parentFlags = [true, false] as const;
		const peerFlags = [true, false] as const;
		const toolModes = ["empty", "nonempty"] as const;
		const subModes = ["empty", "nonempty"] as const;

		it.each(
			parentFlags.flatMap((disallowParent) =>
				peerFlags.flatMap((disallowPeers) =>
					toolModes.flatMap((toolsMode) =>
						subModes.map((subsMode) => ({
							disallowParent,
							disallowPeers,
							toolsMode,
							subsMode,
						})),
					),
				),
			),
		)("schema warn matrix parent=$disallowParent peer=$disallowPeers tools=$toolsMode subs=$subsMode", async ({
			disallowParent,
			disallowPeers,
			toolsMode,
			subsMode,
		}) => {
			const { z } = await import("zod");
			const warn = vi.fn();
			const child =
				subsMode === "nonempty"
					? new LlmAgent({ name: "child_warn", model: "gemini-2.5-flash" })
					: undefined;
			const agent = new LlmAgent({
				name: "schema_matrix",
				outputSchema: z.object({ value: z.string() }),
				disallowTransferToParent: disallowParent,
				disallowTransferToPeers: disallowPeers,
				tools: toolsMode === "nonempty" ? [makeTool()] : [],
				subAgents: child ? [child] : [],
			});
			(agent as any).logger = { warn, debug: vi.fn(), error: vi.fn() };
			agent["validateOutputSchemaConfig"]();

			const transferWarned = warn.mock.calls.some((c) =>
				String(c[0]).includes("transfer flags allow transfers"),
			);
			const toolsWarned = warn.mock.calls.some((c) =>
				String(c[0]).includes("tools are configured"),
			);
			const subsWarned = warn.mock.calls.some((c) =>
				String(c[0]).includes("subAgents are present"),
			);

			expect(transferWarned).toBe(!(disallowParent && disallowPeers));
			expect(toolsWarned).toBe(toolsMode === "nonempty");
			expect(subsWarned).toBe(subsMode === "nonempty");
		});

		it("skips all schema warns when outputSchema is absent", () => {
			const warn = vi.fn();
			const agent = new LlmAgent({
				name: "no_schema",
				tools: [makeTool()],
				subAgents: [new LlmAgent({ name: "c", model: "gemini-2.5-flash" })],
			});
			(agent as any).logger = { warn, debug: vi.fn(), error: vi.fn() };
			agent["validateOutputSchemaConfig"]();
			expect(warn).not.toHaveBeenCalled();
		});
	});

	describe("llmFlow selection matrix", () => {
		it.each([
			{
				label: "both locked empty subs → SingleFlow",
				disallowParent: true,
				disallowPeers: true,
				subs: 0,
				expectSingle: true,
			},
			{
				label: "both locked with subs → AutoFlow",
				disallowParent: true,
				disallowPeers: true,
				subs: 1,
				expectSingle: false,
			},
			{
				label: "parent open → AutoFlow",
				disallowParent: false,
				disallowPeers: true,
				subs: 0,
				expectSingle: false,
			},
			{
				label: "peer open → AutoFlow",
				disallowParent: true,
				disallowPeers: false,
				subs: 0,
				expectSingle: false,
			},
			{
				label: "both open → AutoFlow",
				disallowParent: false,
				disallowPeers: false,
				subs: 0,
				expectSingle: false,
			},
			{
				label: "both open with many subs → AutoFlow",
				disallowParent: false,
				disallowPeers: false,
				subs: 2,
				expectSingle: false,
			},
		])("$label", ({ disallowParent, disallowPeers, subs, expectSingle }) => {
			const subAgents = Array.from(
				{ length: subs },
				(_, i) => new LlmAgent({ name: `sub_${i}`, model: "gemini-2.5-flash" }),
			);
			const agent = new LlmAgent({
				name: "flow_pick",
				disallowTransferToParent: disallowParent,
				disallowTransferToPeers: disallowPeers,
				subAgents,
			});
			const flow = agent["llmFlow"];
			if (expectSingle) {
				expect(SingleFlow).toHaveBeenCalled();
				expect(flow).toBeInstanceOf(SingleFlow);
			} else {
				expect(AutoFlow).toHaveBeenCalled();
				expect(flow).toBeInstanceOf(AutoFlow);
			}
		});
	});

	describe("runAsyncImpl error envelope matrix", () => {
		function mockFlowRunAsync(
			runAsync: () => AsyncGenerator<Event, void, unknown>,
		) {
			(SingleFlow as any).mockImplementation(function (this: any) {
				this.runAsync = vi.fn(runAsync);
			});
		}

		it("yields flow events then stops cleanly", async () => {
			mockFlowRunAsync(async function* () {
				yield new Event({
					author: "happy_flow",
					content: { parts: [{ text: "a" }] },
				});
				yield new Event({
					author: "happy_flow",
					content: { parts: [{ text: "b" }] },
				});
			});
			const agent = new LlmAgent({
				name: "happy_flow",
				disallowTransferToParent: true,
				disallowTransferToPeers: true,
			});
			(agent as any).logger = {
				debug: vi.fn(),
				error: vi.fn(),
				warn: vi.fn(),
			};

			const events: Event[] = [];
			for await (const event of agent["runAsyncImpl"](mockContext)) {
				events.push(event);
			}
			expect(events.map((e) => e.content?.parts?.[0]?.text)).toEqual([
				"a",
				"b",
			]);
		});

		it.each([
			{
				label: "Error",
				throwValue: new Error("boom-err"),
				expected: "boom-err",
			},
			{ label: "string", throwValue: "boom-str", expected: "boom-str" },
			{ label: "number", throwValue: 42, expected: "42" },
			{
				label: "object",
				throwValue: { code: "X" },
				expected: "[object Object]",
			},
		])("wraps $label throw as AGENT_EXECUTION_ERROR after prior yields", async ({
			throwValue,
			expected,
		}) => {
			mockFlowRunAsync(async function* () {
				yield new Event({
					author: "err_flow",
					content: { parts: [{ text: "prior" }] },
				});
				throw throwValue;
			});
			const agent = new LlmAgent({
				name: "err_flow",
				disallowTransferToParent: true,
				disallowTransferToPeers: true,
			});
			(agent as any).logger = {
				debug: vi.fn(),
				error: vi.fn(),
				warn: vi.fn(),
			};

			const events: Event[] = [];
			for await (const event of agent["runAsyncImpl"](mockContext)) {
				events.push(event);
			}
			expect(events).toHaveLength(2);
			expect(events[0].content?.parts?.[0]?.text).toBe("prior");
			expect(events[1].errorCode).toBe("AGENT_EXECUTION_ERROR");
			expect(events[1].errorMessage).toBe(expected);
			expect(events[1].content?.parts?.[0]?.text).toBe(`Error: ${expected}`);
		});
	});
});
