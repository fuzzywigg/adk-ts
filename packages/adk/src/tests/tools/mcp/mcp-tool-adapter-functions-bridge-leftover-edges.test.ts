import { describe, expect, it, vi } from "vitest";
import { LlmAgent } from "../../../agents/llm-agent";
import type { InvocationContext } from "../../../agents/invocation-context";
import { Event } from "../../../events/event";
import { handleFunctionCallsAsync } from "../../../flows/llm-flows/functions";
import { convertMcpToolToBaseTool } from "../../../tools/mcp/create-tool";

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

const LONG_DESC = "MCP bridge leftover coverage for functions integration";

function makeInvocationContext(): InvocationContext {
	const agent = new LlmAgent({
		name: "agent",
		model: "gemini-2.0-flash-exp",
	});
	return {
		invocationId: "inv-bridge",
		branch: "main",
		agent,
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

describe("MCP↔functions bridge leftover: adapter in handleFunctionCalls (post #151)", () => {
	it("convertMcpToolToBaseTool declaration + runAsync integrate with handleFunctionCallsAsync", async () => {
		const toolHandler = vi.fn().mockResolvedValue({
			content: [{ type: "text", text: "mcp-ok" }],
			isError: false,
		});

		const tool = await convertMcpToolToBaseTool({
			mcpTool: {
				name: "bridge_echo",
				description: LONG_DESC,
				inputSchema: {
					type: "object",
					properties: {
						msg: { type: "string" },
					},
				},
			} as any,
			toolHandler,
		});

		const declaration = tool.getDeclaration();
		expect(declaration.name).toBe("bridge_echo");
		expect(declaration.parameters?.properties).toHaveProperty("msg");

		const functionCallEvent = new Event({
			author: "agent",
			content: {
				role: "model",
				parts: [
					{
						functionCall: {
							id: "call-bridge-1",
							name: "bridge_echo",
							args: { msg: "hi" },
						},
					},
				],
			},
		});

		const result = await handleFunctionCallsAsync(
			makeInvocationContext(),
			functionCallEvent,
			{ bridge_echo: tool },
		);

		expect(toolHandler).toHaveBeenCalledWith("bridge_echo", { msg: "hi" });
		expect(result?.getFunctionResponses()[0].response).toEqual({
			content: [{ type: "text", text: "mcp-ok" }],
			isError: false,
		});
	});

	it("MCP adapter client.callTool path surfaces result through handleFunctionCallsAsync", async () => {
		const callTool = vi.fn().mockResolvedValue({
			content: [{ type: "text", text: "via-client" }],
		});
		const tool = await convertMcpToolToBaseTool({
			mcpTool: {
				name: "bridge_client",
				description: LONG_DESC,
				inputSchema: { type: "object", properties: {} },
			} as any,
			client: { callTool } as any,
		});

		const functionCallEvent = new Event({
			author: "agent",
			content: {
				role: "model",
				parts: [
					{
						functionCall: {
							id: "call-client",
							name: "bridge_client",
							args: { x: 1 },
						},
					},
				],
			},
		});

		const result = await handleFunctionCallsAsync(
			makeInvocationContext(),
			functionCallEvent,
			{ bridge_client: tool },
		);

		expect(callTool).toHaveBeenCalledWith({
			name: "bridge_client",
			arguments: { x: 1 },
		});
		expect(result?.getFunctionResponses()[0].response).toEqual({
			content: [{ type: "text", text: "via-client" }],
		});
	});

	it("MCP adapter execution error propagates through handleFunctionCallsAsync", async () => {
		const tool = await convertMcpToolToBaseTool({
			mcpTool: {
				name: "bridge_fail",
				description: LONG_DESC,
				inputSchema: { type: "object", properties: {} },
			} as any,
			toolHandler: async () => {
				throw new Error("mcp explode");
			},
		});

		const functionCallEvent = new Event({
			author: "agent",
			content: {
				role: "model",
				parts: [
					{
						functionCall: {
							id: "call-fail",
							name: "bridge_fail",
							args: {},
						},
					},
				],
			},
		});

		await expect(
			handleFunctionCallsAsync(makeInvocationContext(), functionCallEvent, {
				bridge_fail: tool,
			}),
		).rejects.toThrow(/Error executing MCP tool bridge_fail: mcp explode/);
	});

	it("isLongRunning MCP adapter returning null yields null from handleFunctionCallsAsync", async () => {
		const tool = await convertMcpToolToBaseTool({
			mcpTool: {
				name: "bridge_long",
				description: LONG_DESC,
				inputSchema: { type: "object", properties: {} },
				metadata: { isLongRunning: true },
			} as any,
			toolHandler: async () => null,
		});

		expect(tool.isLongRunning).toBe(true);

		const functionCallEvent = new Event({
			author: "agent",
			content: {
				role: "model",
				parts: [
					{
						functionCall: {
							id: "call-long",
							name: "bridge_long",
							args: {},
						},
					},
				],
			},
		});

		const result = await handleFunctionCallsAsync(
			makeInvocationContext(),
			functionCallEvent,
			{ bridge_long: tool },
		);
		expect(result).toBeNull();
	});
});
