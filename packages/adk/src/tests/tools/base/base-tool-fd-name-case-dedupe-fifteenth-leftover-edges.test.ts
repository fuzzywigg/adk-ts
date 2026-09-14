import { Type } from "@google/genai";
import { describe, expect, it } from "vitest";
import { LlmRequest } from "../../../models/llm-request";
import { BaseTool } from "../../../tools/base/base-tool";
import type { ToolContext } from "../../../tools/tool-context";

class DeclTool extends BaseTool {
	constructor(
		config: ConstructorParameters<typeof BaseTool>[0],
		private readonly decl: any,
	) {
		super(config);
	}

	getDeclaration() {
		return this.decl;
	}

	async runAsync() {
		return {};
	}
}

function makeContext(): ToolContext {
	return { actions: {} } as ToolContext;
}

function makeDecl(name: string) {
	return {
		name,
		description: "decl",
		parameters: {
			type: Type.OBJECT,
			properties: { q: { type: Type.STRING } },
			required: ["q"],
		},
	};
}

/**
 * Fifteenth leftover: FD dedupe uses `fd?.name === functionDeclaration.name`
 * (case-sensitive). Near-miss casing still appends a second declaration.
 */
describe("base-tool FD name case dedupe fifteenth leftover", () => {
	it.each([
		"Dup_Tool",
		"DUP_TOOL",
		"dup_Tool",
		"dup-tool",
		"dup_tool ",
	] as const)("near-miss existing FD %j still appends dup_tool", async (existing) => {
		const tool = new DeclTool(
			{ name: "dup_tool", description: "Case-sensitive FD dedupe" },
			makeDecl("dup_tool"),
		);
		const request = new LlmRequest({
			config: {
				tools: [{ functionDeclarations: [{ name: existing }] }],
			} as any,
		});
		await tool.processLlmRequest(makeContext(), request);
		const fds = (request.config?.tools?.[0] as any).functionDeclarations;
		expect(fds).toHaveLength(2);
		expect(fds[1].name).toBe("dup_tool");
	});

	it("exact-case match still dedupes (control)", async () => {
		const tool = new DeclTool(
			{ name: "dup_tool", description: "Exact dedupe control" },
			makeDecl("dup_tool"),
		);
		const request = new LlmRequest({
			config: {
				tools: [{ functionDeclarations: [{ name: "dup_tool" }] }],
			} as any,
		});
		await tool.processLlmRequest(makeContext(), request);
		const fds = (request.config?.tools?.[0] as any).functionDeclarations;
		expect(fds).toHaveLength(1);
	});
});
