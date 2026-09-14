import { describe, expect, it, vi } from "vitest";
import { GetUserChoiceTool } from "../../../tools/common/get-user-choice-tool";
import type { ToolContext } from "../../../tools/tool-context";

function makeContext(actions: Record<string, unknown> = {}): ToolContext {
	return { actions } as ToolContext;
}

describe("GetUserChoiceTool options.join sixth leftover edges (post #151)", () => {
	it("logs sparse options via Array.prototype.join holes as empty slots", async () => {
		const tool = new GetUserChoiceTool();
		const debug = vi
			.spyOn((tool as any).logger, "debug")
			.mockImplementation(() => {});
		const sparse = [] as string[];
		sparse[1] = "a";
		sparse[3] = "b";
		expect(sparse.length).toBe(4);

		await expect(
			tool.runAsync({ options: sparse }, makeContext()),
		).resolves.toBeNull();

		expect(debug).toHaveBeenCalledWith(
			`Executing get_user_choice with options: ${sparse.join(", ")}`,
		);
		expect(sparse.join(", ")).toBe(", a, , b");
	});

	it.each([
		{ label: "undefined", options: undefined },
		{ label: "null", options: null },
	] as const)("throws when options is $label because join is invoked unconditionally", async ({
		options,
	}) => {
		const tool = new GetUserChoiceTool();
		await expect(
			tool.runAsync({ options: options as any }, makeContext()),
		).rejects.toThrow();
	});

	it.each([
		{ label: "empty-string", question: "" },
		{ label: "0", question: 0 },
		{ label: "false", question: false },
		{ label: "null", question: null },
	] as const)("skips question debug log when question is falsy ($label)", async ({
		question,
	}) => {
		const tool = new GetUserChoiceTool();
		const debug = vi
			.spyOn((tool as any).logger, "debug")
			.mockImplementation(() => {});
		await tool.runAsync(
			{ options: ["only"], question: question as any },
			makeContext(),
		);
		const messages = debug.mock.calls.map((c) => String(c[0]));
		expect(messages.some((m) => m.includes("Question:"))).toBe(false);
		expect(
			messages.some((m) =>
				m.includes("Executing get_user_choice with options: only"),
			),
		).toBe(true);
	});

	it("logs question when question is whitespace-only (truthy)", async () => {
		const tool = new GetUserChoiceTool();
		const debug = vi
			.spyOn((tool as any).logger, "debug")
			.mockImplementation(() => {});
		await tool.runAsync({ options: ["x"], question: "   " }, makeContext());
		expect(debug).toHaveBeenCalledWith("Question:    ");
	});
});
