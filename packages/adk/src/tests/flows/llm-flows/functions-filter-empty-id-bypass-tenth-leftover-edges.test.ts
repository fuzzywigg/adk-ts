import { describe, expect, it, vi } from "vitest";
import type { InvocationContext } from "../../../agents/invocation-context";
import { Event } from "../../../events/event";
import { handleFunctionCallsAsync } from "../../../flows/llm-flows/functions";
import { BaseTool } from "../../../tools/base/base-tool";
import type { ToolContext } from "../../../tools/tool-context";

vi.mock("../../../logger", () => ({
	Logger: vi.fn(() => ({
		debug: vi.fn(),
		error: vi.fn(),
		warn: vi.fn(),
		info: vi.fn(),
	})),
}));

vi.mock("../../../telemetry", () => ({
	telemetryService: {
		getTracer: vi.fn(() => ({
			startSpan: () => ({
				setStatus: vi.fn(),
				recordException: vi.fn(),
				end: vi.fn(),
			}),
		})),
		traceToolCall: vi.fn(),
	},
}));

class FakeTool extends BaseTool {
	readonly impl = vi.fn(async (args: Record<string, any>) => ({
		ok: true,
		args,
	}));

	constructor() {
		super({ name: "echo_tool", description: "echo" });
	}

	async runAsync(args: Record<string, any>, _context: ToolContext) {
		return this.impl(args);
	}
}

function makeInvocationContext(): InvocationContext {
	return {
		invocationId: "inv-1",
		branch: "main",
		agent: {
			name: "llm-agent",
			canonicalModel: "gpt-4o",
			canonicalBeforeToolCallbacks: [],
			canonicalAfterToolCallbacks: [],
		},
		session: {
			id: "s1",
			appName: "app",
			userId: "u1",
			state: {},
			events: [],
			lastUpdateTime: 0,
		},
	} as unknown as InvocationContext;
}

function functionCallEvent(
	calls: Array<{ name: string; id?: string; args?: Record<string, unknown> }>,
): Event {
	return new Event({
		author: "agent",
		invocationId: "inv-1",
		content: {
			role: "model",
			parts: calls.map((c) => ({
				functionCall: {
					name: c.name,
					id: c.id,
					args: c.args ?? {},
				},
			})),
		},
	});
}

describe("handleFunctionCallsAsync filter bypass when id is falsy (tenth leftover)", () => {
	it("empty-string id still runs despite a non-empty filters Set", async () => {
		const tool = new FakeTool();
		const result = await handleFunctionCallsAsync(
			makeInvocationContext(),
			functionCallEvent([{ name: "echo_tool", id: "", args: { n: 1 } }]),
			{ echo_tool: tool },
			new Set(["keep-only"]),
		);
		expect(tool.impl).toHaveBeenCalledTimes(1);
		expect(result?.getFunctionResponses()).toHaveLength(1);
	});

	it("missing id also bypasses the filters.has gate", async () => {
		const tool = new FakeTool();
		const result = await handleFunctionCallsAsync(
			makeInvocationContext(),
			functionCallEvent([{ name: "echo_tool", args: { n: 2 } }]),
			{ echo_tool: tool },
			new Set(["keep-only"]),
		);
		expect(tool.impl).toHaveBeenCalledTimes(1);
		expect(result?.getFunctionResponses()).toHaveLength(1);
	});

	it("whitespace id is truthy and is filtered out", async () => {
		const tool = new FakeTool();
		const result = await handleFunctionCallsAsync(
			makeInvocationContext(),
			functionCallEvent([{ name: "echo_tool", id: " ", args: { n: 3 } }]),
			{ echo_tool: tool },
			new Set(["keep-only"]),
		);
		expect(tool.impl).not.toHaveBeenCalled();
		expect(result).toBeNull();
	});

	it("matching id still executes when present in the filter set", async () => {
		const tool = new FakeTool();
		const result = await handleFunctionCallsAsync(
			makeInvocationContext(),
			functionCallEvent([
				{ name: "echo_tool", id: "keep-only", args: { n: 4 } },
			]),
			{ echo_tool: tool },
			new Set(["keep-only"]),
		);
		expect(tool.impl).toHaveBeenCalledTimes(1);
		expect(result?.getFunctionResponses()[0].id).toBe("keep-only");
	});
});
