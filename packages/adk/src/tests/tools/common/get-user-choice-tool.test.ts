import { Type } from "@google/genai";
import { describe, expect, it } from "vitest";
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
});
