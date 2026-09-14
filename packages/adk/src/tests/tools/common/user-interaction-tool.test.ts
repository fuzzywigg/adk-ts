import { Type } from "@google/genai";
import { describe, expect, it, vi } from "vitest";
import { UserInteractionTool } from "../../../tools/common/user-interaction-tool";
import type { ToolContext } from "../../../tools/tool-context";

describe("UserInteractionTool", () => {
	it("exposes user_interaction metadata and is long-running", () => {
		const tool = new UserInteractionTool();
		const declaration = tool.getDeclaration();

		expect(tool.name).toBe("user_interaction");
		expect(tool.description).toBe(
			"Prompt the user for input during agent execution",
		);
		expect(tool.isLongRunning).toBe(true);
		expect(declaration.name).toBe("user_interaction");
		expect(declaration.description).toBe(tool.description);
		expect(declaration.parameters?.type).toBe(Type.OBJECT);
		expect(declaration.parameters?.required).toEqual(["prompt"]);
		expect(declaration.parameters?.properties?.prompt).toEqual({
			type: Type.STRING,
			description: "The prompt message to display to the user",
		});
		expect(declaration.parameters?.properties?.options).toEqual({
			type: Type.ARRAY,
			description: "Optional array of choices to present to the user",
			items: { type: Type.STRING },
		});
		expect(declaration.parameters?.properties?.defaultValue).toEqual({
			type: Type.STRING,
			description: "Optional default value for the input field",
		});
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

	it("returns an error when actions is missing entirely", async () => {
		const tool = new UserInteractionTool();
		const context = {} as ToolContext;

		await expect(tool.runAsync({ prompt: "Hi?" }, context)).resolves.toEqual({
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

	it("treats undefined options the same as empty (no choices)", async () => {
		const tool = new UserInteractionTool();
		const promptUser = vi.fn().mockResolvedValue("solo");
		const context = {
			actions: { promptUser },
		} as unknown as ToolContext;

		await tool.runAsync({ prompt: "Name?", defaultValue: "Anon" }, context);

		expect(promptUser).toHaveBeenCalledWith({
			prompt: "Name?",
			defaultValue: "Anon",
			options: undefined,
		});
	});

	it("forwards a single option as choices", async () => {
		const tool = new UserInteractionTool();
		const promptUser = vi.fn().mockResolvedValue("only");
		const context = {
			actions: { promptUser, skipSummarization: vi.fn() },
		} as unknown as ToolContext;

		await tool.runAsync({ prompt: "Pick", options: ["only"] }, context);

		expect(promptUser).toHaveBeenCalledWith({
			prompt: "Pick",
			defaultValue: undefined,
			options: { choices: ["only"] },
		});
	});

	it("returns success:false when promptUser throws Error", async () => {
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
				promptUser: vi.fn().mockRejectedValue("aborted"),
			},
		} as unknown as ToolContext;

		await expect(tool.runAsync({ prompt: "Name?" }, context)).resolves.toEqual({
			success: false,
			error: "aborted",
		});
	});

	it("still succeeds when skipSummarization throws after being called", async () => {
		const tool = new UserInteractionTool();
		const promptUser = vi.fn().mockResolvedValue("ok");
		const skipSummarization = vi.fn().mockImplementation(() => {
			throw new Error("skip failed");
		});
		const context = {
			actions: { promptUser, skipSummarization },
		} as unknown as ToolContext;

		await expect(tool.runAsync({ prompt: "Go" }, context)).resolves.toEqual({
			success: false,
			error: "skip failed",
		});
		expect(promptUser).not.toHaveBeenCalled();
	});

	it("returns empty string userInput when promptUser resolves to empty", async () => {
		const tool = new UserInteractionTool();
		const promptUser = vi.fn().mockResolvedValue("");
		const context = {
			actions: { promptUser },
		} as unknown as ToolContext;

		await expect(tool.runAsync({ prompt: "?" }, context)).resolves.toEqual({
			success: true,
			userInput: "",
		});
	});

	it("returns an error when promptUser is null", async () => {
		const tool = new UserInteractionTool();
		const context = {
			actions: { promptUser: null, skipSummarization: vi.fn() },
		} as unknown as ToolContext;

		await expect(tool.runAsync({ prompt: "Hi" }, context)).resolves.toEqual({
			success: false,
			error: "User interaction is not supported in the current environment",
		});
	});

	it("preserves choice order when forwarding options", async () => {
		const tool = new UserInteractionTool();
		const promptUser = vi.fn().mockResolvedValue("c");
		const context = {
			actions: { promptUser, skipSummarization: vi.fn() },
		} as unknown as ToolContext;

		await tool.runAsync(
			{ prompt: "Pick", options: ["c", "a", "b", "a"] },
			context,
		);

		expect(promptUser).toHaveBeenCalledWith({
			prompt: "Pick",
			defaultValue: undefined,
			options: { choices: ["c", "a", "b", "a"] },
		});
	});

	it("calls skipSummarization before promptUser", async () => {
		const tool = new UserInteractionTool();
		const order: string[] = [];
		const skipSummarization = vi.fn().mockImplementation(() => {
			order.push("skip");
		});
		const promptUser = vi.fn().mockImplementation(async () => {
			order.push("prompt");
			return "ok";
		});
		const context = {
			actions: { promptUser, skipSummarization },
		} as unknown as ToolContext;

		await tool.runAsync({ prompt: "Go" }, context);
		expect(order).toEqual(["skip", "prompt"]);
	});

	it("stringifies object and number throws from promptUser", async () => {
		const tool = new UserInteractionTool();

		await expect(
			tool.runAsync({ prompt: "o" }, {
				actions: { promptUser: vi.fn().mockRejectedValue({ code: 1 }) },
			} as unknown as ToolContext),
		).resolves.toEqual({ success: false, error: "[object Object]" });

		await expect(
			tool.runAsync({ prompt: "n" }, {
				actions: { promptUser: vi.fn().mockRejectedValue(7) },
			} as unknown as ToolContext),
		).resolves.toEqual({ success: false, error: "7" });
	});

	it("forwards empty-string defaultValue and empty prompt", async () => {
		const tool = new UserInteractionTool();
		const promptUser = vi.fn().mockResolvedValue("filled");
		const context = {
			actions: { promptUser },
		} as unknown as ToolContext;

		await tool.runAsync({ prompt: "", defaultValue: "" }, context);

		expect(promptUser).toHaveBeenCalledWith({
			prompt: "",
			defaultValue: "",
			options: undefined,
		});
	});

	it("does not call skipSummarization when promptUser is unavailable", async () => {
		const tool = new UserInteractionTool();
		const skipSummarization = vi.fn();
		const context = {
			actions: { skipSummarization },
		} as unknown as ToolContext;

		await tool.runAsync({ prompt: "x" }, context);
		expect(skipSummarization).not.toHaveBeenCalled();
	});

	it("returns success with whitespace-only userInput", async () => {
		const tool = new UserInteractionTool();
		const promptUser = vi.fn().mockResolvedValue("   ");
		const context = {
			actions: { promptUser },
		} as unknown as ToolContext;

		await expect(tool.runAsync({ prompt: "?" }, context)).resolves.toEqual({
			success: true,
			userInput: "   ",
		});
	});

	it("does not set escalate or transferToAgent on success", async () => {
		const tool = new UserInteractionTool();
		const context = {
			actions: {
				promptUser: vi.fn().mockResolvedValue("yes"),
				skipSummarization: vi.fn(),
			},
		} as unknown as ToolContext;

		await tool.runAsync({ prompt: "Confirm?" }, context);

		expect((context.actions as any).escalate).toBeUndefined();
		expect((context.actions as any).transferToAgent).toBeUndefined();
	});
});
