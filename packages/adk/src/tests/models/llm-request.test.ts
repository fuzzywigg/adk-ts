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

		it("joins an empty instructions array to an empty string", () => {
			req.appendInstructions([]);
			expect(req.config?.systemInstruction).toBe("");
		});

		it("creates config when appending to a bare request", () => {
			expect(req.config).toBeUndefined();
			req.appendInstructions(["only"]);
			expect(req.config).toEqual({ systemInstruction: "only" });
		});
	});

	describe("appendTools", () => {
		it("should do nothing if tools is empty", () => {
			req.appendTools([]);
			expect(req.config).toBeUndefined();
		});

		it("should do nothing if tools is undefined/null", () => {
			req.appendTools(undefined as any);
			expect(req.config).toBeUndefined();
			req.appendTools(null as any);
			expect(req.config).toBeUndefined();
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

		it("skips tools without getDeclaration and keeps declared ones", () => {
			const declared = {
				name: "keep",
				getDeclaration: () => ({ name: "keep" }),
			};
			const bare = { name: "skip" };
			req.appendTools([bare as any, declared as any]);
			expect(req.toolsDict.keep).toBe(declared);
			expect(req.toolsDict.skip).toBeUndefined();
			expect(req.config?.tools).toEqual([
				{ functionDeclarations: [{ name: "keep" }] },
			]);
		});

		it("pushes another functionDeclarations entry when tools already exist", () => {
			req.config = { tools: [{ functionDeclarations: [{ name: "prior" }] }] };
			const tool = { name: "next", getDeclaration: () => ({ name: "next" }) };
			req.appendTools([tool as any]);
			expect(req.config.tools).toHaveLength(2);
			expect(req.config.tools?.[1]).toEqual({
				functionDeclarations: [{ name: "next" }],
			});
			expect(req.toolsDict.next).toBe(tool);
		});

		it("does not mutate config when every tool lacks a declaration", () => {
			req.config = { systemInstruction: "keep-me" };
			req.appendTools([
				{ name: "a", getDeclaration: () => undefined } as any,
				{ name: "b" } as any,
			]);
			expect(req.config).toEqual({ systemInstruction: "keep-me" });
			expect(req.toolsDict).toEqual({});
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

		it("creates a fresh config object when none exists", () => {
			expect(req.config).toBeUndefined();
			req.setOutputSchema({ type: "object" });
			expect(req.config).toEqual({
				responseSchema: { type: "object" },
				responseMimeType: "application/json",
			});
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

		it("returns undefined-ish join when Content has parts but no text", () => {
			req.config = {
				systemInstruction: { parts: [{}, { text: "" }] } as any,
			};
			expect(req.getSystemInstructionText()).toBe("");
		});

		it("falls through when Content-like object has no parts", () => {
			req.config = {
				systemInstruction: { role: "system" } as any,
			};
			expect(req.getSystemInstructionText()).toBe("[object Object]");
		});

		it("should fallback to string conversion for other types", () => {
			req.config = { systemInstruction: 123 as any };
			expect(req.getSystemInstructionText()).toBe("123");
		});
	});

	describe("extractTextFromContent", () => {
		it("returns strings unchanged", () => {
			expect(LlmRequest.extractTextFromContent("plain")).toBe("plain");
		});

		it("joins array parts and filters empty text", () => {
			expect(
				LlmRequest.extractTextFromContent([
					{ text: "a" },
					{ text: "" },
					{ text: "b" },
					{},
				]),
			).toBe("ab");
		});

		it("joins Content.parts and filters empties", () => {
			expect(
				LlmRequest.extractTextFromContent({
					parts: [{ text: "hello" }, { text: "" }, { text: "world" }],
				}),
			).toBe("helloworld");
		});

		it("stringifies nullish and non-content values", () => {
			expect(LlmRequest.extractTextFromContent(null)).toBe("");
			expect(LlmRequest.extractTextFromContent(undefined)).toBe("");
			expect(LlmRequest.extractTextFromContent(0)).toBe("");
			expect(LlmRequest.extractTextFromContent(42)).toBe("42");
			expect(LlmRequest.extractTextFromContent({ role: "user" })).toBe(
				"[object Object]",
			);
		});
	});
});
