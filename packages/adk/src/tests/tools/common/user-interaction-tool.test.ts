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

	it("omits choices and skipSummarization when unavailable", async () => {
		const tool = new UserInteractionTool();
		const promptUser = vi.fn().mockResolvedValue("ok");
		const context = {
			actions: { promptUser },
		} as unknown as ToolContext;

		const result = await tool.runAsync(
			{ prompt: "Continue?", options: [] },
			context,
		);

		expect(promptUser).toHaveBeenCalledWith({
			prompt: "Continue?",
			defaultValue: undefined,
			options: undefined,
		});
		expect(result).toEqual({ success: true, userInput: "ok" });
	});

	it("returns success:false when promptUser throws", async () => {
		const tool = new UserInteractionTool();
		const context = {
			actions: {
				promptUser: vi.fn().mockRejectedValue(new Error("dialog cancelled")),
				skipSummarization: vi.fn(),
			},
		} as unknown as ToolContext;

		await expect(tool.runAsync({ prompt: "Name?" }, context)).resolves.toEqual({
			success: false,
			error: "dialog cancelled",
		});
	});

	it("stringifies non-Error throws from promptUser", async () => {
		const tool = new UserInteractionTool();
		const context = {
			actions: {
				promptUser: vi.fn().mockRejectedValue("cancelled-string"),
			},
		} as unknown as ToolContext;

		await expect(tool.runAsync({ prompt: "Name?" }, context)).resolves.toEqual({
			success: false,
			error: "cancelled-string",
		});
	});

	it("returns unsupported when actions is missing entirely", async () => {
		const tool = new UserInteractionTool();
		const context = {} as ToolContext;

		await expect(tool.runAsync({ prompt: "Hello?" }, context)).resolves.toEqual(
			{
				success: false,
				error: "User interaction is not supported in the current environment",
			},
		);
	});

	it("forwards defaultValue without options when options is omitted", async () => {
		const tool = new UserInteractionTool();
		const promptUser = vi.fn().mockResolvedValue("Guest");
		const context = {
			actions: { promptUser, skipSummarization: vi.fn() },
		} as unknown as ToolContext;

		const result = await tool.runAsync(
			{ prompt: "Name?", defaultValue: "Guest" },
			context,
		);

		expect(promptUser).toHaveBeenCalledWith({
			prompt: "Name?",
			defaultValue: "Guest",
			options: undefined,
		});
		expect(result).toEqual({ success: true, userInput: "Guest" });
	});

	it("declares options as array of strings and defaultValue as optional", () => {
		const tool = new UserInteractionTool();
		const declaration = tool.getDeclaration();
		expect(declaration.parameters?.properties?.options).toEqual(
			expect.objectContaining({
				type: expect.anything(),
				items: expect.objectContaining({ type: expect.anything() }),
			}),
		);
		expect(declaration.parameters?.properties?.defaultValue).toBeTruthy();
		expect(declaration.parameters?.properties?.prompt?.description).toMatch(
			/prompt message/i,
		);
	});
});
