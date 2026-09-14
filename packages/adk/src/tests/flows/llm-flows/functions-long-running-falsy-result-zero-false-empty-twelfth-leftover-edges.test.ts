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
	constructor(
		config: ConstructorParameters<typeof BaseTool>[0],
		private readonly impl: () => Promise<unknown>,
	) {
		super(config);
	}

	async runAsync(_args: Record<string, any>, _context: ToolContext) {
		return this.impl();
	}
}

function invocation(): InvocationContext {
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

function callEvent(name: string): Event {
	return new Event({
		author: "agent",
		invocationId: "inv-1",
		content: {
			role: "model",
			parts: [{ functionCall: { name, id: "c1", args: {} } }],
		},
	});
}

describe("handleFunctionCallsAsync long-running !result twelfth leftover", () => {
	it.each([
		{ label: "0", value: 0 },
		{ label: "false", value: false },
		{ label: "empty string", value: "" },
		{ label: "null", value: null },
	])("long-running $label result is skipped (no function-response event)", async ({
		value,
	}) => {
		const tool = new FakeTool(
			{ name: "slow", description: "slow", isLongRunning: true },
			async () => value,
		);
		const result = await handleFunctionCallsAsync(
			invocation(),
			callEvent("slow"),
			{ slow: tool },
		);
		expect(result).toBeNull();
	});

	it.each([
		{ label: "empty array", value: [] as unknown, wrapped: false },
		{ label: "empty object", value: {} as unknown, wrapped: false },
		{ label: "whitespace", value: " " as unknown, wrapped: true },
	])("long-running truthy $label is wrapped as a function response", async ({
		value,
		wrapped,
	}) => {
		const tool = new FakeTool(
			{ name: "slow", description: "slow", isLongRunning: true },
			async () => value,
		);
		const result = await handleFunctionCallsAsync(
			invocation(),
			callEvent("slow"),
			{ slow: tool },
		);
		expect(result?.getFunctionResponses()[0].response).toEqual(
			wrapped ? { result: value } : value,
		);
	});
});
