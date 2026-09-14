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

function baseRequest(overrides: Record<string, unknown> = {}) {
	return {
		method: "sampling/createMessage",
		params: {
			messages: [
				{
					role: "user",
					content: { type: "text", text: "hello" },
				},
			],
			maxTokens: 8,
			...overrides,
		},
	} as any;
}

/**
 * Eleventh leftover: convertMcpMessagesToADK only prepends when `if (systemPrompt)`
 * is truthy. Empty messages arrays are still valid (Array.isArray).
 */
describe("mcp sampling systemPrompt falsy + empty messages eleventh leftover", () => {
	let handlerFn: ReturnType<typeof vi.fn>;
	let handler: McpSamplingHandler;

	beforeEach(() => {
		handlerFn = vi.fn(async () => "ok");
		handler = new McpSamplingHandler(handlerFn);
	});

	it("does not prepend when systemPrompt is empty string (schema-valid falsy)", async () => {
		await handler.handleSamplingRequest(baseRequest({ systemPrompt: "" }));
		const contents = handlerFn.mock.calls[0][0].contents;
		expect(contents).toHaveLength(1);
		expect(contents[0].parts[0].text).toBe("hello");
	});

	it("omitted systemPrompt does not prepend", async () => {
		await handler.handleSamplingRequest(baseRequest());
		expect(handlerFn.mock.calls[0][0].contents).toHaveLength(1);
	});

	it.each([
		{ label: "null", systemPrompt: null },
		{ label: "0", systemPrompt: 0 },
		{ label: "false", systemPrompt: false },
	])("convertMcpMessagesToADK skips prepend for non-string falsy $label", ({
		systemPrompt,
	}) => {
		const convert = (handler as any).convertMcpMessagesToADK.bind(handler);
		const contents = convert(
			[{ role: "user", content: { type: "text", text: "hello" } }],
			systemPrompt,
		);
		expect(contents).toHaveLength(1);
		expect(contents[0].parts[0].text).toBe("hello");
	});

	it.each([
		"   ",
		"0",
		"false",
	])("prepends truthy systemPrompt %j as user-role content", async (systemPrompt) => {
		await handler.handleSamplingRequest(baseRequest({ systemPrompt }));
		const contents = handlerFn.mock.calls[0][0].contents;
		expect(contents[0]).toEqual({
			role: "user",
			parts: [{ text: systemPrompt }],
		});
		expect(contents[1].parts[0].text).toBe("hello");
	});

	it("empty messages array is valid and yields no converted messages", async () => {
		await handler.handleSamplingRequest(
			baseRequest({ messages: [], systemPrompt: "SYS" }),
		);
		expect(handlerFn.mock.calls[0][0].contents).toEqual([
			{ role: "user", parts: [{ text: "SYS" }] },
		]);
	});

	it("empty messages without systemPrompt yields empty contents", async () => {
		await handler.handleSamplingRequest(baseRequest({ messages: [] }));
		expect(handlerFn.mock.calls[0][0].contents).toEqual([]);
	});
});
