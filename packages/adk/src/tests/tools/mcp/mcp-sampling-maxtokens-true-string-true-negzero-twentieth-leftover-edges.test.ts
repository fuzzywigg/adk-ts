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
 * Twentieth leftover: fourteenth pins maxTokens `-0` reject after schema.
 * Boolean `true` / `"true"` fail CreateMessageRequestSchema before the
 * `!maxTokens` gate; temperature `-0` still passthrough (number).
 */
describe("mcp sampling maxTokens/temperature true twentieth leftover", () => {
	let handlerFn: ReturnType<typeof vi.fn>;
	let handler: McpSamplingHandler;

	beforeEach(() => {
		handlerFn = vi.fn(async () => "ok");
		handler = new McpSamplingHandler(handlerFn);
	});

	it.each([
		{ label: "boolean true", value: true, received: "boolean" },
		{ label: '"true"', value: "true", received: "string" },
	])("maxTokens $label fails schema before !maxTokens gate", async ({
		value,
		received,
	}) => {
		await expect(
			handler.handleSamplingRequest({
				method: "sampling/createMessage",
				params: {
					messages: [{ role: "user", content: { type: "text", text: "hi" } }],
					maxTokens: value as any,
				},
			} as any),
		).rejects.toMatchObject({
			type: McpErrorType.INVALID_REQUEST_ERROR,
			message: expect.stringMatching(
				new RegExp(`expected number.*received ${received}`, "s"),
			),
		});
		expect(handlerFn).not.toHaveBeenCalled();
	});

	it("maxTokens SameValueZero -0 still rejected by !maxTokens (fourteenth control)", async () => {
		await expect(
			handler.handleSamplingRequest({
				method: "sampling/createMessage",
				params: {
					messages: [{ role: "user", content: { type: "text", text: "hi" } }],
					maxTokens: -0,
				},
			} as any),
		).rejects.toMatchObject({
			type: McpErrorType.INVALID_REQUEST_ERROR,
			message: expect.stringContaining("maxTokens"),
		});
		expect(handlerFn).not.toHaveBeenCalled();
	});

	it.each([
		{ label: "boolean true", value: true, received: "boolean" },
		{ label: '"true"', value: "true", received: "string" },
	])("temperature $label fails schema (number expected)", async ({
		value,
		received,
	}) => {
		await expect(
			handler.handleSamplingRequest({
				method: "sampling/createMessage",
				params: {
					messages: [{ role: "user", content: { type: "text", text: "hi" } }],
					maxTokens: 8,
					temperature: value as any,
				},
			} as any),
		).rejects.toMatchObject({
			type: McpErrorType.INVALID_REQUEST_ERROR,
			message: expect.stringMatching(
				new RegExp(`expected number.*received ${received}`, "s"),
			),
		});
		expect(handlerFn).not.toHaveBeenCalled();
	});

	it("temperature SameValueZero -0 passthrough (number, no || coalesce)", async () => {
		await handler.handleSamplingRequest({
			method: "sampling/createMessage",
			params: {
				messages: [{ role: "user", content: { type: "text", text: "hi" } }],
				maxTokens: 8,
				temperature: -0,
			},
		} as any);
		expect(handlerFn.mock.calls[0][0].config.temperature).toBe(-0);
	});
});
