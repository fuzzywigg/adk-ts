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
 * HEAVY tip-relaunch residual deepen after tip 1f70668 / post #286 (lands closed
 * #278 onto tip; complements #259 hint-name true/negzero): schema requires
 * hint.name string — `"Infinity"` is the schema-valid residual keep; POSITIVE_INFINITY /
 * `NaN` / `Object(true)` / number `1` reject before `h?.name` truthiness.
 */
describe("mcp sampling hint name string-infinity vs nonstring twentieth residual deepen", () => {
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

	it('keeps hint.name "Infinity" via truthiness then || (schema-valid residual)', async () => {
		expect(await modelForHints([{ name: "Infinity" }, { name: "later" }])).toBe(
			"Infinity",
		);
	});

	it.each([
		{ label: "POSITIVE_INFINITY", value: Number.POSITIVE_INFINITY },
		{ label: "NaN", value: Number.NaN },
		{ label: "Object(true)", value: Object(true) },
		{ label: "number 1", value: 1 },
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
