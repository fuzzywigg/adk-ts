import { Type } from "@google/genai";
import { describe, expect, it, vi } from "vitest";
import { ExitLoopTool } from "../../../tools/common/exit-loop-tool";
import { GetUserChoiceTool } from "../../../tools/common/get-user-choice-tool";
import { TransferToAgentTool } from "../../../tools/common/transfer-to-agent-tool";
import type { ToolContext } from "../../../tools/tool-context";

function makeContext(actions: Record<string, unknown> = {}): ToolContext {
	return { actions } as ToolContext;
}

describe("GetUserChoiceTool fourth leftover matrices", () => {
	it("locks long-running metadata and declaration schema", () => {
		const tool = new GetUserChoiceTool();
		const declaration = tool.getDeclaration();
		expect(tool.name).toBe("get_user_choice");
		expect(tool.isLongRunning).toBe(true);
		expect(tool.description).toContain("options");
		expect(declaration.parameters?.type).toBe(Type.OBJECT);
		expect(declaration.parameters?.required).toEqual(["options"]);
		expect(declaration.parameters?.properties?.options?.type).toBe(Type.ARRAY);
		expect(declaration.parameters?.properties?.options?.items).toEqual({
			type: Type.STRING,
		});
		expect(declaration.parameters?.properties?.question?.type).toBe(
			Type.STRING,
		);
	});

	const optionMatrices: Array<{
		label: string;
		options: string[];
		question?: string;
	}> = [
		{ label: "single option", options: ["only"] },
		{ label: "two options", options: ["a", "b"] },
		{ label: "three options", options: ["x", "y", "z"] },
		{ label: "empty options", options: [] },
		{ label: "unicode options", options: ["はい", "いいえ"] },
		{ label: "whitespace options", options: [" ", "  "] },
		{
			label: "with question",
			options: ["red", "blue"],
			question: "Pick a color",
		},
		{ label: "empty question", options: ["1"], question: "" },
		{
			label: "long option text",
			options: ["a".repeat(200)],
			question: "long",
		},
	];

	for (const { label, options, question } of optionMatrices) {
		it(`returns null and sets skipSummarization: ${label}`, async () => {
			const tool = new GetUserChoiceTool();
			const context = makeContext();
			const args = question === undefined ? { options } : { options, question };
			await expect(tool.runAsync(args, context)).resolves.toBeNull();
			expect(context.actions.skipSummarization).toBe(true);
		});
	}

	it("overwrites skipSummarization false to true", async () => {
		const tool = new GetUserChoiceTool();
		const context = makeContext({ skipSummarization: false });
		await tool.runAsync({ options: ["a"] }, context);
		expect(context.actions.skipSummarization).toBe(true);
	});

	it("preserves other action flags while setting skipSummarization", async () => {
		const tool = new GetUserChoiceTool();
		const context = makeContext({
			escalate: true,
			transferToAgent: "other",
		});
		await tool.runAsync({ options: ["keep"] }, context);
		expect(context.actions.skipSummarization).toBe(true);
		expect(context.actions.escalate).toBe(true);
		expect(context.actions.transferToAgent).toBe("other");
	});

	it("logs options joined by comma and question when present", async () => {
		const tool = new GetUserChoiceTool();
		const debug = vi
			.spyOn((tool as any).logger, "debug")
			.mockImplementation(() => {});
		await tool.runAsync(
			{ options: ["one", "two"], question: "Choose" },
			makeContext(),
		);
		expect(debug).toHaveBeenCalledWith(expect.stringContaining("one, two"));
		expect(debug).toHaveBeenCalledWith(expect.stringContaining("Choose"));
	});

	it("skips question debug log when question omitted", async () => {
		const tool = new GetUserChoiceTool();
		const debug = vi
			.spyOn((tool as any).logger, "debug")
			.mockImplementation(() => {});
		await tool.runAsync({ options: ["solo"] }, makeContext());
		const messages = debug.mock.calls.map((c) => String(c[0]));
		expect(messages.some((m) => m.includes("Question:"))).toBe(false);
		expect(messages.some((m) => m.includes("solo"))).toBe(true);
	});

	it("repeated calls keep returning null", async () => {
		const tool = new GetUserChoiceTool();
		const context = makeContext();
		await expect(
			tool.runAsync({ options: ["a"] }, context),
		).resolves.toBeNull();
		await expect(
			tool.runAsync({ options: ["b", "c"] }, context),
		).resolves.toBeNull();
		expect(context.actions.skipSummarization).toBe(true);
	});
});

describe("TransferToAgentTool fourth leftover matrices", () => {
	it("declaration requires agent_name string", () => {
		const tool = new TransferToAgentTool();
		const declaration = tool.getDeclaration();
		expect(tool.name).toBe("transfer_to_agent");
		expect(declaration.name).toBe("transfer_to_agent");
		expect(declaration.parameters?.required).toEqual(["agent_name"]);
		expect(declaration.parameters?.properties?.agent_name).toEqual({
			type: Type.STRING,
			description: "The name of the agent to transfer control to",
		});
	});

	const agents = [
		"researcher",
		"writer",
		"",
		"agent-with-dashes",
		"agent_with_underscores",
		"日本語エージェント",
		"a".repeat(100),
		" spaced ",
	];

	for (const agent_name of agents) {
		it(`sets transferToAgent to ${JSON.stringify(agent_name)}`, async () => {
			const tool = new TransferToAgentTool();
			const context = makeContext();
			await expect(
				tool.runAsync({ agent_name }, context),
			).resolves.toBeUndefined();
			expect(context.actions.transferToAgent).toBe(agent_name);
		});
	}

	it("overwrites prior transfer target without clearing escalate", async () => {
		const tool = new TransferToAgentTool();
		const context = makeContext({
			transferToAgent: "old",
			escalate: true,
			skipSummarization: true,
		});
		await tool.runAsync({ agent_name: "new-agent" }, context);
		expect(context.actions.transferToAgent).toBe("new-agent");
		expect(context.actions.escalate).toBe(true);
		expect(context.actions.skipSummarization).toBe(true);
	});

	it("logs the transfer target", async () => {
		const tool = new TransferToAgentTool();
		const debug = vi
			.spyOn((tool as any).logger, "debug")
			.mockImplementation(() => {});
		await tool.runAsync({ agent_name: "ops" }, makeContext());
		expect(debug).toHaveBeenCalledWith(expect.stringContaining("ops"));
	});

	it("sequential transfers update to the latest agent", async () => {
		const tool = new TransferToAgentTool();
		const context = makeContext();
		await tool.runAsync({ agent_name: "first" }, context);
		await tool.runAsync({ agent_name: "second" }, context);
		expect(context.actions.transferToAgent).toBe("second");
	});
});

describe("ExitLoopTool fourth leftover matrices", () => {
	it("exposes exit_loop name/description and null declaration", () => {
		const tool = new ExitLoopTool();
		expect(tool.name).toBe("exit_loop");
		expect(tool.description).toContain("Exits the loop");
		expect(tool.getDeclaration()).toBeNull();
		expect(tool.isLongRunning).toBe(false);
	});

	const argMatrices: Array<{ label: string; args: Record<string, unknown> }> = [
		{ label: "empty args", args: {} },
		{ label: "reason string", args: { reason: "done" } },
		{ label: "force true", args: { force: true } },
		{ label: "nested junk", args: { nested: { a: 1 }, list: [1, 2] } },
		{ label: "nullish fields", args: { x: null, y: undefined } },
	];

	for (const { label, args } of argMatrices) {
		it(`sets escalate true ignoring args: ${label}`, async () => {
			const tool = new ExitLoopTool();
			const context = makeContext();
			await expect(tool.runAsync(args, context)).resolves.toBeUndefined();
			expect(context.actions.escalate).toBe(true);
		});
	}

	it("does not clear transferToAgent or skipSummarization", async () => {
		const tool = new ExitLoopTool();
		const context = makeContext({
			transferToAgent: "peer",
			skipSummarization: true,
		});
		await tool.runAsync({}, context);
		expect(context.actions.escalate).toBe(true);
		expect(context.actions.transferToAgent).toBe("peer");
		expect(context.actions.skipSummarization).toBe(true);
	});

	it("overwrites escalate false to true", async () => {
		const tool = new ExitLoopTool();
		const context = makeContext({ escalate: false });
		await tool.runAsync({}, context);
		expect(context.actions.escalate).toBe(true);
	});

	it("logs exit via debug", async () => {
		const tool = new ExitLoopTool();
		const debug = vi
			.spyOn((tool as any).logger, "debug")
			.mockImplementation(() => {});
		await tool.runAsync({}, makeContext());
		expect(debug).toHaveBeenCalledWith(expect.stringContaining("exit loop"));
	});

	it("repeated calls leave escalate true", async () => {
		const tool = new ExitLoopTool();
		const context = makeContext();
		await tool.runAsync({}, context);
		await tool.runAsync({ again: true }, context);
		expect(context.actions.escalate).toBe(true);
	});
});
