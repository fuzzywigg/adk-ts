import { describe, expect, it, vi } from "vitest";
import type { InvocationContext } from "../../../agents/invocation-context";
import { requestProcessor as agentTransferRequestProcessor } from "../../../flows/llm-flows/agent-transfer";
import { AutoFlow } from "../../../flows/llm-flows/auto-flow";
import {
	AF_FUNCTION_CALL_ID_PREFIX,
	REQUEST_EUC_FUNCTION_CALL_NAME,
	generateClientFunctionCallId,
	getLongRunningFunctionCalls,
	populateClientFunctionCallId,
	removeClientFunctionCallId,
} from "../../../flows/llm-flows/functions";
import { SingleFlow } from "../../../flows/llm-flows/single-flow";
import { Event } from "../../../events/event";
import { BaseTool } from "../../../tools/base/base-tool";
import type { ToolContext } from "../../../tools/tool-context";
import { basicRequestProcessor } from "../../../flows/llm-flows";

vi.mock("../../../logger", () => ({
	Logger: vi.fn(() => ({
		debug: vi.fn(),
		error: vi.fn(),
		warn: vi.fn(),
		info: vi.fn(),
	})),
}));

class FakeTool extends BaseTool {
	constructor(
		config: ConstructorParameters<typeof BaseTool>[0],
		private readonly impl?: (args: Record<string, any>) => Promise<any>,
	) {
		super(config);
	}

	async runAsync(args: Record<string, any>, _context: ToolContext) {
		if (this.impl) {
			return this.impl(args);
		}
		return { ok: true, args };
	}
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

describe("functions helpers heavy matrix leftover edges", () => {
	it("exports AF prefix and EUC function name constants", () => {
		expect(AF_FUNCTION_CALL_ID_PREFIX).toBe("adk-");
		expect(REQUEST_EUC_FUNCTION_CALL_NAME).toBe("adk_request_credential");
	});

	it("generateClientFunctionCallId always starts with adk-", () => {
		const a = generateClientFunctionCallId();
		const b = generateClientFunctionCallId();
		expect(a.startsWith("adk-")).toBe(true);
		expect(b.startsWith("adk-")).toBe(true);
		expect(a).not.toBe(b);
	});

	it("populateClientFunctionCallId assigns missing ids only", () => {
		const event = functionCallEvent([
			{ name: "search", id: "keep-me" },
			{ name: "lookup" },
		]);
		populateClientFunctionCallId(event);
		const calls = event.getFunctionCalls();
		expect(calls[0].id).toBe("keep-me");
		expect(calls[1].id?.startsWith("adk-")).toBe(true);
	});

	it("removeClientFunctionCallId strips only adk- prefixed ids", () => {
		const content = {
			role: "user" as const,
			parts: [
				{ functionCall: { name: "a", id: "adk-abc" } },
				{ functionCall: { name: "b", id: "keep" } },
				{
					functionResponse: {
						name: "a",
						id: "adk-xyz",
						response: { ok: true },
					},
				},
				{
					functionResponse: {
						name: "b",
						id: "server-id",
						response: { ok: true },
					},
				},
			],
		};
		removeClientFunctionCallId(content);
		expect(content.parts[0].functionCall?.id).toBeUndefined();
		expect(content.parts[1].functionCall?.id).toBe("keep");
		expect(content.parts[2].functionResponse?.id).toBeUndefined();
		expect(content.parts[3].functionResponse?.id).toBe("server-id");
	});

	it("getLongRunningFunctionCalls returns ids for long-running tools only", () => {
		const toolsDict = {
			slow: new FakeTool({
				name: "slow",
				description: "Long running tool name",
				isLongRunning: true,
			}),
			fast: new FakeTool({
				name: "fast",
				description: "Fast tool description",
			}),
		};
		const event = functionCallEvent([
			{ name: "slow", id: "1" },
			{ name: "fast", id: "2" },
			{ name: "missing", id: "3" },
		]);
		const ids = getLongRunningFunctionCalls(
			event.getFunctionCalls(),
			toolsDict,
		);
		expect([...ids].sort()).toEqual(["1"]);
	});

	it("getLongRunningFunctionCalls ignores calls without ids", () => {
		const toolsDict = {
			slow: new FakeTool({
				name: "slow",
				description: "Long running tool name",
				isLongRunning: true,
			}),
		};
		const event = functionCallEvent([{ name: "slow" }]);
		const ids = getLongRunningFunctionCalls(
			event.getFunctionCalls(),
			toolsDict,
		);
		expect(ids.size).toBe(0);
	});
});

describe("SingleFlow and AutoFlow heavy matrix leftover edges", () => {
	it("SingleFlow registers eight request processors starting with basic", () => {
		const flow = new SingleFlow();
		expect(flow.requestProcessors).toHaveLength(8);
		expect(flow.requestProcessors[0]).toBe(basicRequestProcessor);
		expect(flow.responseProcessors).toHaveLength(3);
	});

	it("AutoFlow appends agent transfer exactly once after SingleFlow prefix", () => {
		const single = new SingleFlow();
		const auto = new AutoFlow();
		expect(auto).toBeInstanceOf(SingleFlow);
		expect(auto.requestProcessors.slice(0, -1)).toEqual(
			single.requestProcessors,
		);
		expect(auto.requestProcessors.at(-1)).toBe(agentTransferRequestProcessor);
		expect(
			auto.requestProcessors.filter((p) => p === agentTransferRequestProcessor),
		).toHaveLength(1);
		expect(auto.responseProcessors).toEqual(single.responseProcessors);
	});

	it("creates independent processor arrays per AutoFlow instance", () => {
		const a = new AutoFlow();
		const b = new AutoFlow();
		expect(a.requestProcessors).not.toBe(b.requestProcessors);
		expect(a.requestProcessors).toHaveLength(b.requestProcessors.length);
	});

	it("agent transfer processor yields nothing without transfer targets", async () => {
		const ctx = {
			invocationId: "inv",
			agent: { name: "solo", subAgents: [] },
			session: { id: "s", appName: "a", userId: "u", state: {}, events: [] },
		} as unknown as InvocationContext;
		const llmRequest: any = {
			appendInstructions: vi.fn(),
			toolsDict: {},
			config: {},
		};
		const events: unknown[] = [];
		for await (const event of agentTransferRequestProcessor.runAsync(
			ctx,
			llmRequest,
		)) {
			events.push(event);
		}
		expect(events).toEqual([]);
		expect(llmRequest.appendInstructions).not.toHaveBeenCalled();
	});

	it("agent transfer processor no-ops when agent lacks subAgents", async () => {
		const ctx = {
			invocationId: "inv",
			agent: { name: "plain" },
		} as unknown as InvocationContext;
		const llmRequest: any = { appendInstructions: vi.fn() };
		const events: unknown[] = [];
		for await (const event of agentTransferRequestProcessor.runAsync(
			ctx,
			llmRequest,
		)) {
			events.push(event);
		}
		expect(events).toEqual([]);
	});
});
