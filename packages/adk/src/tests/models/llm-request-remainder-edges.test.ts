import { beforeEach, describe, expect, it } from "vitest";
import { LlmRequest } from "../../models/llm-request";

describe("LlmRequest remainder edges (TOKENMAXX deepen)", () => {
	let req: LlmRequest;

	beforeEach(() => {
		req = new LlmRequest();
	});

	it("appendTools creates config.tools when config already exists without tools", () => {
		req.config = { temperature: 0.2 };
		const tool = {
			name: "t1",
			getDeclaration: () => ({ name: "t1" }),
		};
		req.appendTools([tool as any]);
		expect(req.config.temperature).toBe(0.2);
		expect(req.config.tools).toEqual([
			{ functionDeclarations: [{ name: "t1" }] },
		]);
		expect(req.toolsDict.t1).toBe(tool);
	});

	it("appendTools pushes onto an existing tools array", () => {
		req.config = { tools: [{ functionDeclarations: [{ name: "prior" }] }] };
		req.appendTools([
			{ name: "next", getDeclaration: () => ({ name: "next" }) } as any,
		]);
		expect(req.config.tools).toHaveLength(2);
		expect((req.config.tools?.[1] as any).functionDeclarations[0].name).toBe(
			"next",
		);
	});

	it("appendTools skips falsy declarations mixed with real ones", () => {
		req.appendTools([
			{ name: "skip-undef", getDeclaration: () => undefined } as any,
			{ name: "skip-null", getDeclaration: () => null } as any,
			{ name: "skip-false", getDeclaration: () => false } as any,
			{ name: "keep", getDeclaration: () => ({ name: "keep" }) } as any,
			{ name: "no-method" } as any,
		]);
		expect(Object.keys(req.toolsDict)).toEqual(["keep"]);
		expect(req.config?.tools).toEqual([
			{ functionDeclarations: [{ name: "keep" }] },
		]);
	});

	it("setOutputSchema overwrites prior mime and schema", () => {
		req.config = {
			responseSchema: { type: "string" },
			responseMimeType: "text/plain",
		};
		req.setOutputSchema({ type: "object", properties: {} });
		expect(req.config.responseSchema).toEqual({
			type: "object",
			properties: {},
		});
		expect(req.config.responseMimeType).toBe("application/json");
	});

	it("extractTextFromContent handles array parts with non-text objects", () => {
		expect(
			LlmRequest.extractTextFromContent([
				{ text: "a" },
				{ functionCall: { name: "x" } },
				{ text: "" },
				{ text: "b" },
			]),
		).toBe("ab");
	});

	it("extractTextFromContent falls through when parts is nullish", () => {
		expect(LlmRequest.extractTextFromContent({ parts: null })).toBe(
			"[object Object]",
		);
		expect(LlmRequest.extractTextFromContent({ parts: undefined })).toBe(
			"[object Object]",
		);
	});

	it("extractTextFromContent falls back for falsy and nullish values", () => {
		// falsy numbers coerce via `content || ""` before String()
		expect(LlmRequest.extractTextFromContent(0)).toBe("");
		expect(LlmRequest.extractTextFromContent(false)).toBe("");
		expect(LlmRequest.extractTextFromContent(null)).toBe("");
		expect(LlmRequest.extractTextFromContent(undefined)).toBe("");
		expect(LlmRequest.extractTextFromContent(42)).toBe("42");
	});

	it("getSystemInstructionText joins content parts and drops empty text", () => {
		req.config = {
			systemInstruction: {
				parts: [{ text: "A" }, { text: "" }, { text: "B" }, {}],
			} as any,
		};
		expect(req.getSystemInstructionText()).toBe("AB");
	});

	it("getSystemInstructionText returns undefined when config missing", () => {
		expect(req.getSystemInstructionText()).toBeUndefined();
		req.config = {};
		expect(req.getSystemInstructionText()).toBeUndefined();
	});

	it("constructor defaults liveConnectConfig and toolsDict independently", () => {
		const a = new LlmRequest();
		const b = new LlmRequest();
		a.toolsDict.x = {} as any;
		expect(b.toolsDict).toEqual({});
		expect(a.liveConnectConfig).not.toBe(b.liveConnectConfig);
	});
});
