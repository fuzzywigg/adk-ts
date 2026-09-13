import { describe, expect, it, vi } from "vitest";
import { UserInteractionTool } from "../../../tools/common/user-interaction-tool";
import type { ToolContext } from "../../../tools/tool-context";

describe("UserInteractionTool", () => {
	it("exposes user_interaction metadata and is long-running", () => {
		const tool = new UserInteractionTool();
		const declaration = tool.getDeclaration();

		expect(tool.name).toBe("user_interaction");
		expect(tool.isLongRunning).toBe(true);
		expect(declaration.parameters?.required).toEqual(["prompt"]);
	});

	it("returns an error when promptUser is unavailable", async () => {
		const tool = new UserInteractionTool();
		const context = { actions: {} } as ToolContext;

		await expect(
			tool.runAsync({ prompt: "What is your name?" }, context),
		).resolves.toEqual({
			success: false,
			error: "User interaction is not supported in the current environment",
		});
	});

	it("prompts the user and skips summarization", async () => {
		const tool = new UserInteractionTool();
		const promptUser = vi.fn().mockResolvedValue("Alice");
		const skipSummarization = vi.fn();
		const context = {
			actions: {
				promptUser,
				skipSummarization,
			},
		} as unknown as ToolContext;

		const result = await tool.runAsync(
			{
				prompt: "What is your name?",
				defaultValue: "Guest",
				options: ["Alice", "Bob"],
			},
			context,
		);

		expect(skipSummarization).toHaveBeenCalledWith(true);
		expect(promptUser).toHaveBeenCalledWith({
			prompt: "What is your name?",
			defaultValue: "Guest",
			options: { choices: ["Alice", "Bob"] },
		});
		expect(result).toEqual({
			success: true,
			userInput: "Alice",
		});
	});
});
