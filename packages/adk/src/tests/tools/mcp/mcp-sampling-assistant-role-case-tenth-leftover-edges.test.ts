import { beforeEach, describe, expect, it, vi } from "vitest";
import { McpSamplingHandler } from "../../../tools/mcp/sampling-handler";
import { McpErrorType } from "../../../tools/mcp/types";

vi.mock("@adk/logger", () => ({
	Logger: vi.fn(() => ({
		debug: vi.fn(),
		error: vi.fn(),
		warn: vi.fn(),
		info: vi.fn(),
	})),
}));

/**
 * Tenth leftover: role === "assistant" is case-sensitive; only exact match → model.
 * Also: !maxTokens rejects "" / false beyond 0/null/undefined matrix.
 */
describe("mcp sampling assistant-role case + maxTokens falsy tenth leftover edges", () => {
	let handler: McpSamplingHandler;

	beforeEach(() => {
		handler = new McpSamplingHandler(vi.fn(async () => "ok"));
	});

	it.each([
		{ role: "assistant", expected: "model" },
		{ role: "Assistant", expected: "user" },
		{ role: "ASSISTANT", expected: "user" },
		{ role: "assistant ", expected: "user" },
		{ role: "user", expected: "user" },
		{ role: "USER", expected: "user" },
	])("convertSingleMcpMessageToADK role $role → $expected", ({
		role,
		expected,
	}) => {
		const convert = (handler as any).convertSingleMcpMessageToADK.bind(handler);
		expect(convert({ role, content: { type: "text", text: "x" } }).role).toBe(
			expected,
		);
	});

	it.each([
		"",
		false,
	])("rejects falsy maxTokens=%j via !maxTokens gate", async (maxTokens) => {
		await expect(
			handler.handleSamplingRequest({
				method: "sampling/createMessage",
				params: {
					messages: [{ role: "user", content: { type: "text", text: "hi" } }],
					maxTokens,
				},
			} as any),
		).rejects.toMatchObject({
			type: McpErrorType.INVALID_REQUEST_ERROR,
			message: expect.stringContaining("maxTokens"),
		});
	});

	it("exact assistant still maps to model (contrast control)", () => {
		const convert = (handler as any).convertSingleMcpMessageToADK.bind(handler);
		expect(
			convert({
				role: "assistant",
				content: { type: "text", text: "y" },
			}).role,
		).toBe("model");
	});
});
