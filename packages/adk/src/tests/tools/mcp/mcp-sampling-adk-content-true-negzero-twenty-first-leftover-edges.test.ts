import { beforeEach, describe, expect, it, vi } from "vitest";
import { LlmResponse } from "../../../models/llm-response";
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
 * Twenty-first leftover (HEAVY tip-relaunch residual after seventh part.text
 * coerce / thirteenth empty parts): `if (adkResponse.content)` — string
 * `"true"` takes string path; boolean `true` / `[]` / `{}` truthy non-string
 * without `.parts` → `""`; SameValueZero `-0` / `false` skip → `""`.
 */
describe("mcp sampling adk content true/negzero twenty-first leftover", () => {
	let handler: McpSamplingHandler;

	beforeEach(() => {
		handler = new McpSamplingHandler(createSamplingHandler(async () => "ok"));
	});

	it('content: "true" is string path → response text "true"', () => {
		const response = new LlmResponse({
			content: "true" as any,
		});
		const mcp = (handler as any).convertADKResponseToMcp(response, "m");
		expect(mcp.content).toEqual({ type: "text", text: "true" });
	});

	it.each([
		{ label: "boolean true", content: true },
		{ label: "empty array", content: [] as never[] },
		{ label: "empty object", content: {} },
	])("content $label truthy non-string without parts → empty text", ({
		content,
	}) => {
		const response = new LlmResponse({
			content: content as any,
		});
		const mcp = (handler as any).convertADKResponseToMcp(response, "m");
		expect(mcp.content).toEqual({ type: "text", text: "" });
	});

	it.each([
		{ label: "-0", content: -0 },
		{ label: "false", content: false },
		{ label: "0", content: 0 },
	])("content $label falsy → skip content gate → empty text", ({ content }) => {
		const response = new LlmResponse({
			content: content as any,
		});
		const mcp = (handler as any).convertADKResponseToMcp(response, "m");
		expect(mcp.content).toEqual({ type: "text", text: "" });
	});
});
