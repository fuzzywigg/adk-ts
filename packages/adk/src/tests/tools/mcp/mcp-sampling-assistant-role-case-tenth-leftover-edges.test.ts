import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	McpSamplingHandler,
	createSamplingHandler,
} from "../../../tools/mcp/sampling-handler";

vi.mock("@adk/logger", () => ({
	Logger: vi.fn(() => ({
		debug: vi.fn(),
		error: vi.fn(),
		warn: vi.fn(),
		info: vi.fn(),
	})),
}));

/**
 * Tenth leftover: `mcpMessage.role === "assistant"` only → `model`.
 * `ASSISTANT` / `Assistant` fall through to `user`. Distinct from #174 LLM role case.
 */
describe("McpSamplingHandler assistant role case tenth leftover (post #176)", () => {
	let handler: McpSamplingHandler;

	beforeEach(() => {
		handler = new McpSamplingHandler(createSamplingHandler(async () => "ok"));
	});

	it('exact "assistant" maps to ADK model role', () => {
		const convert = (handler as any).convertSingleMcpMessageToADK.bind(handler);
		expect(
			convert({
				role: "assistant",
				content: { type: "text", text: "hi" },
			}).role,
		).toBe("model");
	});

	it.each([
		"ASSISTANT",
		"Assistant",
		"assistant ",
		" assistant",
		"user",
		"USER",
		"model",
		"",
	] as const)('near-miss / non-assistant role %j maps to ADK "user"', (role) => {
		const convert = (handler as any).convertSingleMcpMessageToADK.bind(handler);
		expect(
			convert({
				role: role as any,
				content: { type: "text", text: "x" },
			}).role,
		).toBe("user");
	});

	it("convertMcpMessagesToADK maps cased ASSISTANT→user and assistant→model", () => {
		const convert = (handler as any).convertMcpMessagesToADK.bind(handler);
		const contents = convert(
			[
				{
					role: "ASSISTANT",
					content: { type: "text", text: "prior" },
				},
				{
					role: "assistant",
					content: { type: "text", text: "exact" },
				},
			],
			undefined,
		);
		expect(contents.map((c: { role?: string }) => c.role)).toEqual([
			"user",
			"model",
		]);
	});
});
