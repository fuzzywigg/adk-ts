import { describe, expect, it } from "vitest";
import { LlmRequest } from "../../models/llm-request";
import { BaseTool } from "../../tools/base/base-tool";
import type { ToolContext } from "../../tools/tool-context";
import { Type } from "@google/genai";

class DeclTool extends BaseTool {
	getDeclaration() {
		return {
			name: this.name,
			description: this.description,
			parameters: {
				type: Type.OBJECT,
				properties: {},
			},
		};
	}

	async runAsync(_args: Record<string, any>, _context: ToolContext) {
		return {};
	}
}

describe("LlmRequest helpers", () => {
	it("appends system instructions", () => {
		const request = new LlmRequest();
		request.appendInstructions(["Be concise"]);
		expect(request.config?.systemInstruction).toBe("Be concise");

		request.appendInstructions(["Use tools"]);
		expect(request.config?.systemInstruction).toBe("Be concise\n\nUse tools");
	});

	it("appends tool declarations into config.tools", () => {
		const request = new LlmRequest();
		const tool = new DeclTool({
			name: "noop_tool",
			description: "Does nothing useful",
		});

		request.appendTools([tool]);

		expect(request.toolsDict.noop_tool).toBe(tool);
		expect(
			(request.config?.tools?.[0] as any).functionDeclarations[0].name,
		).toBe("noop_tool");
	});

	it("reads system instruction text from string or content parts", () => {
		const asString = new LlmRequest({
			config: { systemInstruction: "plain" },
		});
		expect(asString.getSystemInstructionText()).toBe("plain");

		const asContent = new LlmRequest({
			config: {
				systemInstruction: {
					parts: [{ text: "part-a" }, { text: "part-b" }],
				} as any,
			},
		});
		expect(asContent.getSystemInstructionText()).toBe("part-apart-b");
		expect(new LlmRequest().getSystemInstructionText()).toBeUndefined();
	});

	it("sets json output schema and extracts content text", () => {
		const request = new LlmRequest();
		request.setOutputSchema({ type: "object" });
		expect(request.config?.responseSchema).toEqual({ type: "object" });
		expect(request.config?.responseMimeType).toBe("application/json");

		expect(LlmRequest.extractTextFromContent("plain")).toBe("plain");
		expect(
			LlmRequest.extractTextFromContent({
				parts: [{ text: "hello" }, { text: "world" }],
			}),
		).toBe("helloworld");
		expect(
			LlmRequest.extractTextFromContent([{ text: "a" }, { text: "b" }]),
		).toBe("ab");
	});
});
