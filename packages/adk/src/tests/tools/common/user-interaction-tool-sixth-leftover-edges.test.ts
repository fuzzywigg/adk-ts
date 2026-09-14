import { describe, expect, it, vi } from "vitest";
import { UserInteractionTool } from "../../../tools/common/user-interaction-tool";
import type { ToolContext } from "../../../tools/tool-context";

describe("UserInteractionTool sixth leftover edges (post #151)", () => {
	it.each([
		{ label: "false", actions: false },
		{ label: "0", actions: 0 },
		{ label: "empty-string", actions: "" },
		{ label: "NaN", actions: Number.NaN },
	] as const)("errors when actions is falsy ($label) via !actions short-circuit", async ({
		actions,
	}) => {
		const tool = new UserInteractionTool();
		await expect(
			tool.runAsync({ prompt: "hi" }, { actions } as unknown as ToolContext),
		).resolves.toEqual({
			success: false,
			error: "User interaction is not supported in the current environment",
		});
	});

	it.each([
		{ label: "undefined", promptUser: undefined },
		{ label: "null", promptUser: null },
		{ label: "false", promptUser: false },
		{ label: "0", promptUser: 0 },
		{ label: "empty-string", promptUser: "" },
	] as const)("errors when promptUser is falsy ($label) even if actions object exists", async ({
		promptUser,
	}) => {
		const tool = new UserInteractionTool();
		const skipSummarization = vi.fn();
		await expect(
			tool.runAsync({ prompt: "hi" }, {
				actions: { promptUser, skipSummarization },
			} as unknown as ToolContext),
		).resolves.toEqual({
			success: false,
			error: "User interaction is not supported in the current environment",
		});
		expect(skipSummarization).not.toHaveBeenCalled();
	});

	it("builds choices when options is a sparse array with length > 0", async () => {
		const tool = new UserInteractionTool();
		const promptUser = vi.fn().mockResolvedValue("picked");
		const sparse = [] as string[];
		sparse[0] = "a";
		sparse[2] = "c";
		expect(sparse.length).toBe(3);
		expect(1 in sparse).toBe(false);

		await tool.runAsync({ prompt: "Choose?", options: sparse }, {
			actions: { promptUser },
		} as unknown as ToolContext);

		expect(promptUser).toHaveBeenCalledWith({
			prompt: "Choose?",
			defaultValue: undefined,
			options: { choices: sparse },
		});
	});

	it("builds choices for options=[''] because length > 0 is truthy", async () => {
		const tool = new UserInteractionTool();
		const promptUser = vi.fn().mockResolvedValue("solo");
		await tool.runAsync({ prompt: "Empty choice?", options: [""] }, {
			actions: { promptUser },
		} as unknown as ToolContext);
		expect(promptUser).toHaveBeenCalledWith({
			prompt: "Empty choice?",
			defaultValue: undefined,
			options: { choices: [""] },
		});
	});

	it.each([
		{ label: "undefined", options: undefined },
		{ label: "null", options: null },
		{ label: "empty", options: [] },
	] as const)("omits prompt options when options is $label", async ({
		options,
	}) => {
		const tool = new UserInteractionTool();
		const promptUser = vi.fn().mockResolvedValue("ok");
		await tool.runAsync({ prompt: "Go?", options: options as any }, {
			actions: { promptUser },
		} as unknown as ToolContext);
		expect(promptUser).toHaveBeenCalledWith({
			prompt: "Go?",
			defaultValue: undefined,
			options: undefined,
		});
	});
});
