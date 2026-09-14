import { describe, expect, it } from "vitest";
import { LlmRequest } from "../../models/llm-request";
import { LlmResponse } from "../../models/llm-response";
import { FunctionTool } from "../../tools/function/function-tool";

describe("LlmRequest/LlmResponse heavy matrix leftover edges", () => {
	describe("LlmRequest constructor defaults", () => {
		it.each([
			{ label: "omit data", data: undefined },
			{ label: "empty object", data: {} },
		])("$label", ({ data }) => {
			const req = new LlmRequest(data);
			expect(req.model).toBeUndefined();
			expect(req.contents).toEqual([]);
			expect(req.config).toBeUndefined();
			expect(req.liveConnectConfig).toEqual({});
			expect(req.toolsDict).toEqual({});
		});

		it("preserves provided fields", () => {
			const req = new LlmRequest({
				model: "m",
				contents: [{ role: "user", parts: [{ text: "hi" }] }],
				config: { temperature: 0.2 },
				toolsDict: {},
			});
			expect(req.model).toBe("m");
			expect(req.contents).toHaveLength(1);
			expect(req.config?.temperature).toBe(0.2);
		});
	});

	describe("appendInstructions matrix", () => {
		it.each([
			{
				label: "first write",
				initial: undefined as string | undefined,
				instructions: ["a", "b"],
				expected: "a\n\nb",
			},
			{
				label: "append to existing",
				initial: "base",
				instructions: ["x"],
				expected: "base\n\nx",
			},
			{
				label: "empty list joins to empty then appends separator path",
				initial: "base",
				instructions: [],
				expected: "base\n\n",
			},
		])("$label", ({ initial, instructions, expected }) => {
			const req = new LlmRequest(
				initial === undefined ? {} : { config: { systemInstruction: initial } },
			);
			req.appendInstructions(instructions);
			expect(req.config?.systemInstruction).toBe(expected);
		});

		it("creates config when missing", () => {
			const req = new LlmRequest();
			req.appendInstructions(["only"]);
			expect(req.config?.systemInstruction).toBe("only");
		});
	});

	describe("appendTools matrix", () => {
		it.each([
			{ label: "undefined", tools: undefined },
			{ label: "empty", tools: [] },
		])("no-ops for $label tools", ({ tools }) => {
			const req = new LlmRequest();
			req.appendTools(tools as any);
			expect(req.config).toBeUndefined();
			expect(req.toolsDict).toEqual({});
		});

		it("skips tools without getDeclaration and keeps those with declarations", () => {
			const withDecl = new FunctionTool(
				async function declared() {
					return "ok";
				},
				{ name: "declared", description: "decl tool" },
			);
			const withoutDecl = {
				name: "bare",
				getDeclaration: undefined,
			} as any;
			const nullDecl = {
				name: "nullish",
				getDeclaration: () => undefined,
			} as any;

			const req = new LlmRequest();
			req.appendTools([withoutDecl, withDecl, nullDecl]);
			expect(Object.keys(req.toolsDict)).toEqual(["declared"]);
			expect(req.config?.tools).toHaveLength(1);
			expect((req.config?.tools?.[0] as any).functionDeclarations).toHaveLength(
				1,
			);
		});

		it("appends onto existing config.tools array", () => {
			const tool = new FunctionTool(
				async function t2() {
					return 1;
				},
				{ name: "t2", description: "tool two" },
			);
			const req = new LlmRequest({
				config: { tools: [{ functionDeclarations: [{ name: "prior" }] }] },
			});
			req.appendTools([tool]);
			expect(req.config?.tools).toHaveLength(2);
		});
	});

	describe("setOutputSchema / system instruction text", () => {
		it("setOutputSchema creates config and sets mime type", () => {
			const req = new LlmRequest();
			const schema = { type: "object" };
			req.setOutputSchema(schema);
			expect(req.config?.responseSchema).toBe(schema);
			expect(req.config?.responseMimeType).toBe("application/json");
		});

		it.each([
			{ label: "missing config", config: undefined, expected: undefined },
			{
				label: "missing systemInstruction",
				config: {},
				expected: undefined,
			},
			{
				label: "string instruction",
				config: { systemInstruction: "plain" },
				expected: "plain",
			},
			{
				label: "Content parts join non-empty text",
				config: {
					systemInstruction: {
						parts: [{ text: "a" }, { text: "" }, { text: "b" }],
					},
				},
				expected: "ab",
			},
			{
				label: "Content with empty parts",
				config: { systemInstruction: { parts: [] } },
				expected: "",
			},
			{
				label: "non-string non-content fallback",
				config: { systemInstruction: 12 as any },
				expected: "12",
			},
		])("getSystemInstructionText $label", ({ config, expected }) => {
			const req = new LlmRequest(config ? { config } : {});
			expect(req.getSystemInstructionText()).toBe(expected);
		});
	});

	describe("extractTextFromContent matrix", () => {
		it.each([
			{ label: "string", input: "plain", expected: "plain" },
			{
				label: "parts array",
				input: [{ text: "a" }, { text: "" }, { text: "b" }],
				expected: "ab",
			},
			{
				label: "Content object",
				input: { parts: [{ text: "x" }, { text: "y" }] },
				expected: "xy",
			},
			{ label: "null", input: null, expected: "" },
			{ label: "undefined", input: undefined, expected: "" },
			{ label: "number fallback", input: 5, expected: "5" },
			{ label: "empty object", input: {}, expected: "[object Object]" },
		])("$label", ({ input, expected }) => {
			expect(LlmRequest.extractTextFromContent(input)).toBe(expected);
		});
	});

	describe("LlmResponse.create / fromError matrix", () => {
		it("create prefers candidate content with parts", () => {
			const response = LlmResponse.create({
				candidates: [
					{
						content: { role: "model", parts: [{ text: "hi" }] },
						groundingMetadata: { x: 1 } as any,
					},
				],
				usageMetadata: { promptTokenCount: 1 } as any,
			});
			expect(response.content?.parts?.[0]?.text).toBe("hi");
			expect(response.usageMetadata).toEqual({ promptTokenCount: 1 });
			expect(response.groundingMetadata).toEqual({ x: 1 });
		});

		it("create uses finishReason when candidate lacks parts", () => {
			const response = LlmResponse.create({
				candidates: [
					{
						content: { role: "model" },
						finishReason: "MAX_TOKENS",
						finishMessage: "truncated",
					},
				],
			});
			expect(response.errorCode).toBe("MAX_TOKENS");
			expect(response.errorMessage).toBe("truncated");
		});

		it("create uses promptFeedback when no candidates", () => {
			const response = LlmResponse.create({
				promptFeedback: {
					blockReason: "SAFETY",
					blockReasonMessage: "blocked",
				},
			});
			expect(response.errorCode).toBe("SAFETY");
			expect(response.errorMessage).toBe("blocked");
		});

		it("create falls back to UNKNOWN_ERROR", () => {
			const response = LlmResponse.create({});
			expect(response.errorCode).toBe("UNKNOWN_ERROR");
			expect(response.errorMessage).toBe("Unknown error.");
		});

		it.each([
			{
				label: "Error with model+code",
				error: new Error("boom"),
				options: { model: "m1", errorCode: "E1" },
				code: "E1",
				messageIncludes: "m1",
			},
			{
				label: "string with defaults",
				error: "raw",
				options: {},
				code: "UNKNOWN_ERROR",
				messageIncludes: "unknown",
			},
			{
				label: "number error",
				error: 9,
				options: { model: "m2" },
				code: "UNKNOWN_ERROR",
				messageIncludes: "m2",
			},
		])("fromError $label", ({ error, options, code, messageIncludes }) => {
			const response = LlmResponse.fromError(error, options);
			expect(response.errorCode).toBe(code);
			expect(response.errorMessage).toContain(messageIncludes);
			expect(response.finishReason).toBe("STOP");
			expect(response.error).toBeInstanceOf(Error);
			expect(response.content?.parts?.[0]?.text).toMatch(/^Error: /);
		});
	});
});
