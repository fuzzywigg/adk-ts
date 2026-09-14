import { describe, it, expect, beforeEach } from "vitest";
import { LlmRequest } from "../../models/llm-request";

describe("LlmRequest", () => {
	let req: LlmRequest;

	beforeEach(() => {
		req = new LlmRequest();
	});

	describe("constructor", () => {
		it("should initialize with defaults", () => {
			expect(req.model).toBeUndefined();
			expect(req.contents).toEqual([]);
			expect(req.config).toBeUndefined();
			expect(req.liveConnectConfig).toBeDefined();
			expect(req.toolsDict).toEqual({});
		});

		it("should initialize with provided data", () => {
			const data = {
				model: "foo",
				contents: [{ parts: [{ text: "bar" }] }],
				config: { systemInstruction: "baz" },
				liveConnectConfig: { foo: "bar" } as any,
				toolsDict: { t: {} as any },
			};
			const r = new LlmRequest(data);
			expect(r.model).toBe("foo");
			expect(r.contents).toEqual([{ parts: [{ text: "bar" }] }]);
			expect(r.config).toEqual({ systemInstruction: "baz" });
			expect(r.liveConnectConfig).toEqual({ foo: "bar" });
			expect(r.toolsDict).toEqual({ t: {} });
		});
	});

	describe("appendInstructions", () => {
		it("should set systemInstruction if not present", () => {
			req.appendInstructions(["a", "b"]);
			expect(req.config?.systemInstruction).toBe("a\n\nb");
		});

		it("should append to existing systemInstruction", () => {
			req.config = { systemInstruction: "foo" };
			req.appendInstructions(["bar", "baz"]);
			expect(req.config.systemInstruction).toBe("foo\n\nbar\n\nbaz");
		});

		it("should set empty systemInstruction when given an empty array", () => {
			req.appendInstructions([]);
			expect(req.config?.systemInstruction).toBe("");
		});

		it("should append only a blank separator when existing instruction meets empty array", () => {
			req.config = { systemInstruction: "keep" };
			req.appendInstructions([]);
			expect(req.config.systemInstruction).toBe("keep\n\n");
		});
	});

	describe("appendTools", () => {
		it("should do nothing if tools is empty", () => {
			req.appendTools([]);
			expect(req.config).toBeUndefined();
		});

		it("should do nothing if tools is nullish", () => {
			req.appendTools(null as any);
			req.appendTools(undefined as any);
			expect(req.config).toBeUndefined();
			expect(req.toolsDict).toEqual({});
		});

		it("should append tool declarations and update toolsDict", () => {
			const tool1 = { name: "t1", getDeclaration: () => ({ a: 1 }) };
			const tool2 = { name: "t2", getDeclaration: () => ({ b: 2 }) };
			req.appendTools([tool1 as any, tool2 as any]);
			expect(req.toolsDict.t1).toBe(tool1);
			expect(req.toolsDict.t2).toBe(tool2);
			expect(req.config?.tools).toEqual([
				{ functionDeclarations: [{ a: 1 }, { b: 2 }] },
			]);
		});

		it("should not add tools with no declaration", () => {
			const tool = { name: "t", getDeclaration: () => undefined };
			req.appendTools([tool as any]);
			expect(req.config?.tools).toBeUndefined();
			expect(req.toolsDict.t).toBeUndefined();
		});

		it("should skip tools without getDeclaration and keep ones that declare", () => {
			const withDecl = {
				name: "keep",
				getDeclaration: () => ({ name: "keep" }),
			};
			const withoutMethod = { name: "no_method" };
			const withUndefined = {
				name: "undef",
				getDeclaration: () => undefined,
			};
			req.appendTools([withDecl, withoutMethod, withUndefined] as any);
			expect(req.toolsDict).toEqual({ keep: withDecl });
			expect(req.config?.tools).toEqual([
				{ functionDeclarations: [{ name: "keep" }] },
			]);
		});

		it("should push onto an existing config.tools array", () => {
			req.config = { tools: [{ functionDeclarations: [{ name: "prior" }] }] };
			const tool = { name: "next", getDeclaration: () => ({ name: "next" }) };
			req.appendTools([tool as any]);
			expect(req.config.tools).toEqual([
				{ functionDeclarations: [{ name: "prior" }] },
				{ functionDeclarations: [{ name: "next" }] },
			]);
			expect(req.toolsDict.next).toBe(tool);
		});
	});

	describe("setOutputSchema", () => {
		it("should set responseSchema and responseMimeType", () => {
			req.setOutputSchema({ foo: "bar" });
			expect(req.config?.responseSchema).toEqual({ foo: "bar" });
			expect(req.config?.responseMimeType).toBe("application/json");
		});

		it("should work if config already exists", () => {
			req.config = { systemInstruction: "x" };
			req.setOutputSchema({ y: 1 });
			expect(req.config.responseSchema).toEqual({ y: 1 });
			expect(req.config.responseMimeType).toBe("application/json");
			expect(req.config.systemInstruction).toBe("x");
		});
	});

	describe("getSystemInstructionText", () => {
		it("should return undefined if not set", () => {
			expect(req.getSystemInstructionText()).toBeUndefined();
		});

		it("should return string if systemInstruction is string", () => {
			req.config = { systemInstruction: "foo" };
			expect(req.getSystemInstructionText()).toBe("foo");
		});

		it("should extract text from Content with parts", () => {
			req.config = {
				systemInstruction: {
					parts: [{ text: "a" }, { text: "b" }, { text: "" }, {}],
				},
			};
			expect(req.getSystemInstructionText()).toBe("ab");
		});

		it("should return undefined-coerced empty when Content has empty parts", () => {
			req.config = {
				systemInstruction: { parts: [] } as any,
			};
			expect(req.getSystemInstructionText()).toBe("");
		});

		it("should fall through when Content-like object has no parts property value", () => {
			req.config = {
				systemInstruction: { parts: undefined } as any,
			};
			expect(req.getSystemInstructionText()).toBe("[object Object]");
		});

		it("should fallback to string conversion for other types", () => {
			req.config = { systemInstruction: "123" };
			expect(req.getSystemInstructionText()).toBe("123");
		});

		it("should String()-coerce non-string non-Content systemInstruction values", () => {
			req.config = { systemInstruction: 99 as any };
			expect(req.getSystemInstructionText()).toBe("99");
		});

		it("should String()-coerce boolean and object-without-parts systemInstruction", () => {
			req.config = { systemInstruction: true as any };
			expect(req.getSystemInstructionText()).toBe("true");

			req.config = { systemInstruction: { role: "system" } as any };
			expect(req.getSystemInstructionText()).toBe("[object Object]");
		});

		it("should fallback to empty string when systemInstruction becomes falsy after the guard", () => {
			let reads = 0;
			req.config = {
				get systemInstruction() {
					reads += 1;
					return reads === 1 ? { role: "system" } : (0 as any);
				},
			} as any;
			expect(req.getSystemInstructionText()).toBe("");
		});
	});

	describe("extractTextFromContent", () => {
		it("returns strings as-is", () => {
			expect(LlmRequest.extractTextFromContent("plain")).toBe("plain");
		});

		it("joins array parts and drops falsy text", () => {
			expect(
				LlmRequest.extractTextFromContent([
					{ text: "a" },
					{ text: "" },
					{ text: "b" },
					{},
				]),
			).toBe("ab");
		});

		it("joins Content.parts and drops falsy text", () => {
			expect(
				LlmRequest.extractTextFromContent({
					parts: [{ text: "x" }, { text: null }, { text: "y" }],
				}),
			).toBe("xy");
		});

		it("stringifies nullish and non-content values", () => {
			expect(LlmRequest.extractTextFromContent(null)).toBe("");
			expect(LlmRequest.extractTextFromContent(undefined)).toBe("");
			expect(LlmRequest.extractTextFromContent(7)).toBe("7");
			expect(LlmRequest.extractTextFromContent({ role: "user" })).toBe(
				"[object Object]",
			);
		});

		it("returns empty string for Content with empty parts", () => {
			expect(LlmRequest.extractTextFromContent({ parts: [] })).toBe("");
		});
	});
});
