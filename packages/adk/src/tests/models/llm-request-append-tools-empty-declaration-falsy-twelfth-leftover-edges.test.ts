import { describe, expect, it } from "vitest";
import { LlmRequest } from "../../models/llm-request";

/**
 * Twelfth leftover: appendTools `if (declaration)` treats `""` / 0 / NaN as
 * skip, while `" "` / `[]` / `{}` are truthy and recorded.
 */
describe("llm-request appendTools empty declaration falsy twelfth leftover edges", () => {
	it.each([
		{ label: "empty string", declaration: "" },
		{ label: "0", declaration: 0 },
		{ label: "false", declaration: false },
		{ label: "NaN", declaration: Number.NaN },
	])("skips $label declaration", ({ declaration }) => {
		const req = new LlmRequest();
		req.appendTools([
			{ name: "skip", getDeclaration: () => declaration } as any,
			{ name: "keep", getDeclaration: () => ({ name: "keep" }) } as any,
		]);
		expect(Object.keys(req.toolsDict)).toEqual(["keep"]);
		expect(req.config?.tools).toEqual([
			{ functionDeclarations: [{ name: "keep" }] },
		]);
	});

	it("whitespace string declaration is kept (truthy)", () => {
		const req = new LlmRequest();
		req.appendTools([{ name: "ws", getDeclaration: () => " " } as any]);
		expect(req.toolsDict.ws).toBeDefined();
		expect(req.config?.tools).toEqual([{ functionDeclarations: [" "] }]);
	});

	it("empty array declaration is kept (truthy)", () => {
		const req = new LlmRequest();
		req.appendTools([{ name: "arr", getDeclaration: () => [] } as any]);
		expect(req.toolsDict.arr).toBeDefined();
		expect(req.config?.tools).toEqual([{ functionDeclarations: [[]] }]);
	});

	it("empty object declaration is kept (truthy)", () => {
		const req = new LlmRequest();
		req.appendTools([{ name: "obj", getDeclaration: () => ({}) } as any]);
		expect(req.toolsDict.obj).toBeDefined();
		expect(req.config?.tools).toEqual([{ functionDeclarations: [{}] }]);
	});
});
