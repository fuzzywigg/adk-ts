import { Type } from "@google/genai";
import { describe, expect, it, vi } from "vitest";
import { GetUserChoiceTool } from "../../../tools/common/get-user-choice-tool";
import type { ToolContext } from "../../../tools/tool-context";

function makeContext(actions: Record<string, unknown> = {}): ToolContext {
	return { actions } as ToolContext;
}

describe("GetUserChoiceTool", () => {
	it("is long-running and requires options", () => {
		const tool = new GetUserChoiceTool();
		const declaration = tool.getDeclaration();

		expect(tool.name).toBe("get_user_choice");
		expect(tool.isLongRunning).toBe(true);
		expect(tool.description).toContain("multiple options");
		expect(declaration.name).toBe("get_user_choice");
		expect(declaration.description).toBe(tool.description);
		expect(declaration.parameters?.type).toBe(Type.OBJECT);
		expect(declaration.parameters?.required).toEqual(["options"]);
		expect(declaration.parameters?.properties?.options).toEqual({
			type: Type.ARRAY,
			description: "List of options for the user to choose from",
			items: { type: Type.STRING },
		});
		expect(declaration.parameters?.properties?.question).toEqual({
			type: Type.STRING,
			description:
				"The question or prompt to show the user before presenting options",
		});
	});

	it("skips summarization and returns null", async () => {
		const tool = new GetUserChoiceTool();
		const context = makeContext();

		const result = await tool.runAsync(
			{ options: ["a", "b"], question: "Pick one" },
			context,
		);

		expect(result).toBeNull();
		expect(context.actions.skipSummarization).toBe(true);
	});

	it("works without a question and still skips summarization", async () => {
		const tool = new GetUserChoiceTool();
		const context = makeContext();
		const result = await tool.runAsync({ options: ["only"] }, context);
		expect(result).toBeNull();
		expect(context.actions.skipSummarization).toBe(true);
	});

	it("accepts an empty options list and still returns null", async () => {
		const tool = new GetUserChoiceTool();
		const context = makeContext();

		const result = await tool.runAsync({ options: [] }, context);

		expect(result).toBeNull();
		expect(context.actions.skipSummarization).toBe(true);
	});

	it("overwrites a prior skipSummarization=false", async () => {
		const tool = new GetUserChoiceTool();
		const context = makeContext({ skipSummarization: false });

		await tool.runAsync({ options: ["yes", "no"] }, context);

		expect(context.actions.skipSummarization).toBe(true);
	});

	it("does not set escalate or transferToAgent", async () => {
		const tool = new GetUserChoiceTool();
		const context = makeContext();

		await tool.runAsync(
			{ options: ["x", "y", "z"], question: "Choose" },
			context,
		);

		expect(context.actions.skipSummarization).toBe(true);
		expect(context.actions.escalate).toBeUndefined();
		expect(context.actions.transferToAgent).toBeUndefined();
	});

	it("preserves unrelated action flags", async () => {
		const tool = new GetUserChoiceTool();
		const context = makeContext({
			escalate: true,
			transferToAgent: "other",
		});

		await tool.runAsync({ options: ["a"] }, context);

		expect(context.actions.skipSummarization).toBe(true);
		expect(context.actions.escalate).toBe(true);
		expect(context.actions.transferToAgent).toBe("other");
	});

	it("always returns null regardless of option values", async () => {
		const tool = new GetUserChoiceTool();
		const context = makeContext();

		await expect(
			tool.runAsync(
				{ options: ["alpha", "beta", "gamma"], question: "Which?" },
				context,
			),
		).resolves.toBeNull();
	});

	it("accepts a large options list and still returns null", async () => {
		const tool = new GetUserChoiceTool();
		const options = Array.from({ length: 50 }, (_, i) => `opt-${i}`);
		const context = makeContext();

		await expect(tool.runAsync({ options }, context)).resolves.toBeNull();
		expect(context.actions.skipSummarization).toBe(true);
	});

	it("treats an empty-string question as present for logging", async () => {
		const tool = new GetUserChoiceTool();
		const debug = vi
			.spyOn((tool as any).logger, "debug")
			.mockImplementation(() => {});
		const context = makeContext();

		await tool.runAsync({ options: ["a"], question: "" }, context);

		expect(debug).toHaveBeenCalledTimes(1);
		expect(debug.mock.calls[0][0]).toContain("a");
		expect(context.actions.skipSummarization).toBe(true);
	});

	it("logs both options and a non-empty question", async () => {
		const tool = new GetUserChoiceTool();
		const debug = vi
			.spyOn((tool as any).logger, "debug")
			.mockImplementation(() => {});
		const context = makeContext();

		await tool.runAsync(
			{ options: ["yes", "no"], question: "Continue?" },
			context,
		);

		expect(debug).toHaveBeenCalledTimes(2);
		expect(debug.mock.calls[0][0]).toContain("yes, no");
		expect(debug.mock.calls[1][0]).toContain("Continue?");
	});

	it("accepts duplicate and unicode option values", async () => {
		const tool = new GetUserChoiceTool();
		const context = makeContext();

		await expect(
			tool.runAsync(
				{ options: ["同じ", "同じ", "🎉"], question: "選んで" },
				context,
			),
		).resolves.toBeNull();
		expect(context.actions.skipSummarization).toBe(true);
	});

	it("overwrites skipSummarization even when other flags are set", async () => {
		const tool = new GetUserChoiceTool();
		const context = makeContext({
			skipSummarization: false,
			escalate: false,
			transferToAgent: "stay",
		});

		await tool.runAsync({ options: ["1", "2"] }, context);

		expect(context.actions).toEqual({
			skipSummarization: true,
			escalate: false,
			transferToAgent: "stay",
		});
	});

	it("returns null for a single-option list without a question", async () => {
		const tool = new GetUserChoiceTool();
		const result = await tool.runAsync({ options: ["only"] }, makeContext());
		expect(result).toBeNull();
	});

	it("is long-running and does not retry by default", () => {
		const tool = new GetUserChoiceTool();
		expect(tool.isLongRunning).toBe(true);
		expect(tool.shouldRetryOnFailure).toBe(false);
	});
});
