import { Type } from "@google/genai";
import { describe, expect, it } from "vitest";
import { GetUserChoiceTool } from "../../../tools/common/get-user-choice-tool";
import type { ToolContext } from "../../../tools/tool-context";

function makeContext(): ToolContext {
	return {
		actions: {},
	} as ToolContext;
}

describe("GetUserChoiceTool", () => {
	it("is long-running and requires options", () => {
		const tool = new GetUserChoiceTool();
		const declaration = tool.getDeclaration();

		expect(tool.isLongRunning).toBe(true);
		expect(declaration.name).toBe("get_user_choice");
		expect(declaration.parameters?.required).toEqual(["options"]);
		expect(declaration.parameters?.properties?.options?.type).toBe(Type.ARRAY);
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
});
