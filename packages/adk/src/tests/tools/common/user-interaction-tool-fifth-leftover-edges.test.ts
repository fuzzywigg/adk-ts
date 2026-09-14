import { describe, expect, it, vi } from "vitest";
import { UserInteractionTool } from "../../../tools/common/user-interaction-tool";
import type { ToolContext } from "../../../tools/tool-context";

describe("UserInteractionTool fifth leftover — actions/promptUser/skip/options quirks", () => {
	const unavailableActions: Array<{ label: string; actions: any }> = [
		{ label: "null actions", actions: null },
		{ label: "undefined actions", actions: undefined },
		{ label: "false actions", actions: false },
		{ label: "0 actions", actions: 0 },
		{ label: "empty string actions", actions: "" },
		{ label: "empty object", actions: {} },
		{ label: "promptUser null", actions: { promptUser: null } },
		{ label: "promptUser false", actions: { promptUser: false } },
		{ label: "promptUser 0", actions: { promptUser: 0 } },
		{ label: "promptUser empty string", actions: { promptUser: "" } },
	];

	for (const { label, actions } of unavailableActions) {
		it(`unsupported when ${label}`, async () => {
			const tool = new UserInteractionTool();
			const context = { actions } as unknown as ToolContext;
			await expect(tool.runAsync({ prompt: "Hi?" }, context)).resolves.toEqual({
				success: false,
				error: "User interaction is not supported in the current environment",
			});
		});
	}

	const truthyNonFnSkip: Array<{ label: string; skip: any }> = [
		{ label: "true boolean", skip: true },
		{ label: "number 1", skip: 1 },
		{ label: "string yes", skip: "yes" },
		{ label: "empty object", skip: {} },
		{ label: "empty array", skip: [] },
	];

	for (const { label, skip } of truthyNonFnSkip) {
		it(`truthy non-function skipSummarization (${label}) throws into catch`, async () => {
			const tool = new UserInteractionTool();
			const promptUser = vi.fn().mockResolvedValue("never");
			const context = {
				actions: { promptUser, skipSummarization: skip },
			} as unknown as ToolContext;
			const result = await tool.runAsync({ prompt: "Name?" }, context);
			expect(result.success).toBe(false);
			expect(typeof result.error).toBe("string");
			expect(promptUser).not.toHaveBeenCalled();
		});
	}

	const falsySkip: Array<{ label: string; skip: any }> = [
		{ label: "false", skip: false },
		{ label: "0", skip: 0 },
		{ label: "empty string", skip: "" },
		{ label: "null", skip: null },
		{ label: "undefined", skip: undefined },
	];

	for (const { label, skip } of falsySkip) {
		it(`falsy skipSummarization (${label}) skips call and still prompts`, async () => {
			const tool = new UserInteractionTool();
			const promptUser = vi.fn().mockResolvedValue("ok");
			const context = {
				actions: { promptUser, skipSummarization: skip },
			} as unknown as ToolContext;
			await expect(tool.runAsync({ prompt: "Go?" }, context)).resolves.toEqual({
				success: true,
				userInput: "ok",
			});
			expect(promptUser).toHaveBeenCalled();
		});
	}

	const noChoicesOptions: Array<{ label: string; options: any }> = [
		{ label: "null", options: null },
		{ label: "false", options: false },
		{ label: "0", options: 0 },
		{ label: "empty string", options: "" },
		{ label: "empty array", options: [] },
	];

	for (const { label, options } of noChoicesOptions) {
		it(`options ${label} yields undefined choices bag`, async () => {
			const tool = new UserInteractionTool();
			const promptUser = vi.fn().mockResolvedValue("solo");
			const context = {
				actions: { promptUser },
			} as unknown as ToolContext;
			await tool.runAsync({ prompt: "Pick?", options }, context);
			expect(promptUser).toHaveBeenCalledWith({
				prompt: "Pick?",
				defaultValue: undefined,
				options: undefined,
			});
		});
	}

	it('options [""] has length > 0 so choices are forwarded', async () => {
		const tool = new UserInteractionTool();
		const promptUser = vi.fn().mockResolvedValue("");
		const context = {
			actions: { promptUser, skipSummarization: vi.fn() },
		} as unknown as ToolContext;
		await tool.runAsync({ prompt: "Blank?", options: [""] }, context);
		expect(promptUser).toHaveBeenCalledWith({
			prompt: "Blank?",
			defaultValue: undefined,
			options: { choices: [""] },
		});
	});

	it("stringifies non-Error throw from truthy skipSummarization object call", async () => {
		const tool = new UserInteractionTool();
		const promptUser = vi.fn();
		const context = {
			actions: {
				promptUser,
				skipSummarization: { notCallable: true },
			},
		} as unknown as ToolContext;
		const result = await tool.runAsync({ prompt: "X" }, context);
		expect(result.success).toBe(false);
		expect(result.error).toMatch(/not a function|is not a function/i);
	});
});
