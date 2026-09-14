import { beforeEach, describe, expect, it, vi } from "vitest";
import { McpErrorType } from "../../../tools/mcp/types";
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
 * Twentieth leftover (HEAVY tip-relaunch residual after eleventh hint truthiness):
 * schema requires hint.name string — boolean `true` / `[]` / `-0` /
 * `NEGATIVE_INFINITY` reject before `h?.name` truthiness. String `"true"` is
 * the schema-valid residual keep (sibling of eleventh `"0"`/`"false"`).
 */
describe("mcp sampling hint name true/negzero twentieth leftover", () => {
	let handlerFn: ReturnType<typeof vi.fn>;
	let handler: McpSamplingHandler;

	beforeEach(() => {
		handlerFn = vi.fn(async () => "ok");
		handler = new McpSamplingHandler(handlerFn);
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

	it('keeps hint.name "true" via truthiness then || (schema-valid residual)', async () => {
		expect(await modelForHints([{ name: "true" }, { name: "later" }])).toBe(
			"true",
		);
	});

	it.each([
		{ label: "boolean true", value: true },
		{ label: "empty array", value: [] as never[] },
		{ label: "-0", value: -0 },
		{ label: "NEGATIVE_INFINITY", value: Number.NEGATIVE_INFINITY },
	])("rejects non-string hint.name $label at schema before ||", async ({
		value,
	}) => {
		await expect(modelForHints([{ name: value }])).rejects.toMatchObject({
			type: McpErrorType.INVALID_REQUEST_ERROR,
			message: expect.stringMatching(
				/Invalid sampling request|expected string/,
			),
		});
		expect(handlerFn).not.toHaveBeenCalled();
	});
});
