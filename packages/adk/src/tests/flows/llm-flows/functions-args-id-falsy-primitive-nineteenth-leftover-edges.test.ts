import { describe, expect, it, vi } from "vitest";
import type { InvocationContext } from "../../../agents/invocation-context";
import { Event } from "../../../events/event";
import {
	handleFunctionCallsAsync,
	populateClientFunctionCallId,
} from "../../../flows/llm-flows/functions";
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

class CaptureArgsTool extends BaseTool {
	lastArgs: Record<string, any> | undefined;
	lastContext: ToolContext | undefined;

	constructor() {
		super({ name: "echo", description: "echo" });
	}

	async runAsync(args: Record<string, any>, context: ToolContext) {
		this.lastArgs = args;
		this.lastContext = context;
		return { ok: true };
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

/**
 * Nineteenth leftover (flows residual): `functionCall.args || {}` and
 * `functionCall.id || ""` / `if (!functionCall.id)`.
 */
describe("functions args/id falsy-primitive nineteenth leftover", () => {
	it.each([
		{ label: "0", value: 0 },
		{ label: "false", value: false },
		{ label: "empty-string", value: "" },
	])("args=$label coalesces to {} for the tool", async ({ value }) => {
		const tool = new CaptureArgsTool();
		const result = await handleFunctionCallsAsync(
			invocation(),
			new Event({
				author: "agent",
				invocationId: "inv-1",
				content: {
					role: "model",
					parts: [
						{
							functionCall: {
								name: "echo",
								id: "c1",
								args: value as any,
							},
						},
					],
				},
			}),
			{ echo: tool },
		);
		expect(result).not.toBeNull();
		expect(tool.lastArgs).toEqual({});
	});

	it("object args with numeric 0 field are preserved", async () => {
		const tool = new CaptureArgsTool();
		await handleFunctionCallsAsync(
			invocation(),
			new Event({
				author: "agent",
				invocationId: "inv-1",
				content: {
					role: "model",
					parts: [
						{
							functionCall: {
								name: "echo",
								id: "c1",
								args: { z: 0 },
							},
						},
					],
				},
			}),
			{ echo: tool },
		);
		expect(tool.lastArgs).toEqual({ z: 0 });
	});

	it.each([
		{ label: "0", id: 0 },
		{ label: "false", id: false },
		{ label: "empty-string", id: "" },
	])("functionCallId becomes empty string when id is $label", async ({
		id,
	}) => {
		const tool = new CaptureArgsTool();
		await handleFunctionCallsAsync(
			invocation(),
			new Event({
				author: "agent",
				invocationId: "inv-1",
				content: {
					role: "model",
					parts: [
						{
							functionCall: {
								name: "echo",
								id: id as any,
								args: {},
							},
						},
					],
				},
			}),
			{ echo: tool },
		);
		expect((tool.lastContext as any).functionCallId).toBe("");
	});

	it.each([
		{ label: "string-zero", id: "0" },
		{ label: "whitespace", id: " " },
	])("truthy id $label is kept on tool context", async ({ id }) => {
		const tool = new CaptureArgsTool();
		await handleFunctionCallsAsync(
			invocation(),
			new Event({
				author: "agent",
				invocationId: "inv-1",
				content: {
					role: "model",
					parts: [{ functionCall: { name: "echo", id, args: {} } }],
				},
			}),
			{ echo: tool },
		);
		expect((tool.lastContext as any).functionCallId).toBe(id);
	});

	it.each([
		{ label: "string-zero", id: "0" },
		{ label: "string-false", id: "false" },
	])("populateClientFunctionCallId preserves truthy $label", ({ id }) => {
		const event = new Event({
			author: "agent",
			content: {
				role: "model",
				parts: [{ functionCall: { name: "echo", id, args: {} } }],
			},
		});
		populateClientFunctionCallId(event);
		expect(event.getFunctionCalls()[0].id).toBe(id);
	});

	it("populateClientFunctionCallId regenerates empty id (control)", () => {
		const event = new Event({
			author: "agent",
			content: {
				role: "model",
				parts: [{ functionCall: { name: "echo", id: "", args: {} } }],
			},
		});
		populateClientFunctionCallId(event);
		expect(event.getFunctionCalls()[0].id).toMatch(/^adk-/);
	});
});
