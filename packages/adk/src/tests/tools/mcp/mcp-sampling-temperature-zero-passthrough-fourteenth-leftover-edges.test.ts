import { beforeEach, describe, expect, it, vi } from "vitest";
import { McpSamplingHandler } from "../../../tools/mcp/sampling-handler";

vi.mock("@adk/logger", () => ({
	Logger: vi.fn(() => ({
		debug: vi.fn(),
		error: vi.fn(),
		warn: vi.fn(),
		info: vi.fn(),
	})),
}));

/**
 * Fourteenth leftover: temperature is assigned directly (no ||/??), so
 * temperature: 0 is preserved on the ADK request config.
 */
describe("mcp sampling temperature zero passthrough fourteenth leftover", () => {
	let handlerFn: ReturnType<typeof vi.fn>;
	let handler: McpSamplingHandler;

	beforeEach(() => {
		handlerFn = vi.fn(async () => "ok");
		handler = new McpSamplingHandler(handlerFn);
	});

	it("temperature: 0 is kept on ADK config (not coalesced away)", async () => {
		await handler.handleSamplingRequest({
			method: "sampling/createMessage",
			params: {
				messages: [{ role: "user", content: { type: "text", text: "hi" } }],
				maxTokens: 8,
				temperature: 0,
			},
		} as any);
		expect(handlerFn.mock.calls[0][0].config.temperature).toBe(0);
	});

	it("omitted temperature stays undefined (control)", async () => {
		await handler.handleSamplingRequest({
			method: "sampling/createMessage",
			params: {
				messages: [{ role: "user", content: { type: "text", text: "hi" } }],
				maxTokens: 8,
			},
		} as any);
		expect(handlerFn.mock.calls[0][0].config.temperature).toBeUndefined();
	});
});
