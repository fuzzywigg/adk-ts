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
 * Twentieth leftover: fourteenth pins systemPrompt `"0"`/`"false"` keep;
 * eleventh pins hint `"0"`/`"false"`. Boolean `true` / `"true"` systemPrompt
 * kept via convert path; hint.name `"true"` kept; boolean/`-0` fail schema.
 */
describe("mcp sampling systemPrompt/hint true/negzero twentieth leftover", () => {
	let handlerFn: ReturnType<typeof vi.fn>;
	let handler: McpSamplingHandler;

	beforeEach(() => {
		handlerFn = vi.fn(async () => "ok");
		handler = new McpSamplingHandler(handlerFn);
	});

	it.each([
		{ label: "boolean true", value: true },
		{ label: '"true"', value: "true" },
	])("systemPrompt $label is prepended as user content", ({ value }) => {
		const convert = (handler as any).convertMcpMessagesToADK.bind(handler);
		expect(convert([], value as any)).toEqual([
			{ role: "user", parts: [{ text: value }] },
		]);
	});

	it("systemPrompt SameValueZero -0 is skipped (falsy if)", () => {
		const convert = (handler as any).convertMcpMessagesToADK.bind(handler);
		expect(convert([], -0 as any)).toEqual([]);
	});

	async function modelForHints(hints: unknown) {
		await handler.handleSamplingRequest({
			method: "sampling/createMessage",
			params: {
				messages: [{ role: "user", content: { type: "text", text: "hi" } }],
				maxTokens: 8,
				modelPreferences: { hints },
			},
		} as any);
		return handlerFn.mock.calls[0][0].model;
	}

	it('hint.name "true" kept (truthy find, schema-valid string)', async () => {
		expect(await modelForHints([{ name: "true" }, { name: "later" }])).toBe(
			"true",
		);
	});

	it.each([
		{ label: "boolean true", value: true, received: "boolean" },
		{ label: "SameValueZero -0", value: -0, received: "number" },
	])("hint.name $label fails schema before find()", async ({
		value,
		received,
	}) => {
		await expect(
			handler.handleSamplingRequest({
				method: "sampling/createMessage",
				params: {
					messages: [{ role: "user", content: { type: "text", text: "hi" } }],
					maxTokens: 8,
					modelPreferences: { hints: [{ name: value }] },
				},
			} as any),
		).rejects.toMatchObject({
			type: McpErrorType.INVALID_REQUEST_ERROR,
			message: expect.stringMatching(
				new RegExp(`expected string.*received ${received}`, "s"),
			),
		});
		expect(handlerFn).not.toHaveBeenCalled();
	});
});
