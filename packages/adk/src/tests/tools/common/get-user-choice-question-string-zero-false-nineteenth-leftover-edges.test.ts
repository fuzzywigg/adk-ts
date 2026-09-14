import { describe, expect, it, vi } from "vitest";
import { GetUserChoiceTool } from "../../../tools/common/get-user-choice-tool";
import type { ToolContext } from "../../../tools/tool-context";

function makeContext(actions: Record<string, unknown> = {}): ToolContext {
	return { actions } as ToolContext;
}

/**
 * Nineteenth leftover: `if (args.question)` — string "0"/"false" are truthy and
 * take the debug branch (sixth already pins falsy question skip).
 */
describe("get-user-choice question string-zero/false nineteenth leftover", () => {
	it.each([
		"0",
		"false",
	] as const)("question: %j logs Question: debug line", async (question) => {
		const tool = new GetUserChoiceTool();
		const debug = vi
			.spyOn((tool as any).logger, "debug")
			.mockImplementation(() => {});
		await expect(
			tool.runAsync({ options: ["a"], question }, makeContext()),
		).resolves.toBeNull();
		expect(debug).toHaveBeenCalledWith(`Question: ${question}`);
	});

	it("falsy question still skips Question: debug (control)", async () => {
		const tool = new GetUserChoiceTool();
		const debug = vi
			.spyOn((tool as any).logger, "debug")
			.mockImplementation(() => {});
		await tool.runAsync(
			{ options: ["only"], question: 0 as any },
			makeContext(),
		);
		const messages = debug.mock.calls.map((c) => String(c[0]));
		expect(messages.some((m) => m.includes("Question:"))).toBe(false);
	});
});
