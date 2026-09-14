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

class CaptureIdTool extends BaseTool {
	lastFunctionCallId: string | undefined;

	constructor() {
		super({ name: "id_probe", description: "capture functionCallId" });
	}

	async runAsync(_args: Record<string, any>, context: ToolContext) {
		this.lastFunctionCallId = context.functionCallId;
		return { ok: true };
	}
}

function makeInvocationContext(): InvocationContext {
	return {
		invocationId: "inv-id-or",
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

function functionCallEvent(id: unknown): Event {
	return new Event({
		author: "agent",
		invocationId: "inv-id-or",
		content: {
			role: "model",
			parts: [
				{
					functionCall: {
						name: "id_probe",
						id: id as any,
						args: {},
					},
				},
			],
		},
	});
}

/**
 * Tenth leftover: `functionCall.id || ""` in getToolAndContext.
 * Falsy ids become ""; whitespace id is kept.
 */
describe('functions functionCall.id || "" tenth leftover (post #176)', () => {
	it.each([
		{ label: "undefined", id: undefined },
		{ label: "null", id: null },
		{ label: "0", id: 0 },
		{ label: "false", id: false },
		{ label: '""', id: "" },
		{ label: "NaN", id: Number.NaN },
	] as const)("falsy id ($label) coalesces to empty functionCallId", async ({
		id,
	}) => {
		const tool = new CaptureIdTool();
		await handleFunctionCallsAsync(
			makeInvocationContext(),
			functionCallEvent(id),
			{ id_probe: tool },
		);
		expect(tool.lastFunctionCallId).toBe("");
	});

	it.each([
		" ",
		"\t",
		"call-1",
		"0",
	] as const)("truthy id %j is kept on ToolContext.functionCallId", async (id) => {
		const tool = new CaptureIdTool();
		await handleFunctionCallsAsync(
			makeInvocationContext(),
			functionCallEvent(id),
			{ id_probe: tool },
		);
		expect(tool.lastFunctionCallId).toBe(id);
	});
});
