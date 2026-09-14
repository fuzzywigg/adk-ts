import { describe, expect, it } from "vitest";
import { LlmRequest } from "../../models/llm-request";

/**
 * Thirteenth leftover: appendTools stores toolsDict[tool.name] with exact keys.
 * Twelfth leftover only pinned declaration truthiness, not Map-key exactness.
 */
describe("llm-request toolsDict name map-key thirteenth leftover edges", () => {
	it('empty-string name is stored under ""', () => {
		const req = new LlmRequest();
		const tool = { name: "", getDeclaration: () => ({ name: "" }) } as any;
		req.appendTools([tool]);
		expect(req.toolsDict[""]).toBe(tool);
		expect(Object.keys(req.toolsDict)).toEqual([""]);
	});

	it("Search and search are distinct keys", () => {
		const req = new LlmRequest();
		const upper = {
			name: "Search",
			getDeclaration: () => ({ name: "Search" }),
		} as any;
		const lower = {
			name: "search",
			getDeclaration: () => ({ name: "search" }),
		} as any;
		req.appendTools([upper, lower]);
		expect(req.toolsDict.Search).toBe(upper);
		expect(req.toolsDict.search).toBe(lower);
	});

	it("whitespace name is distinct from empty string", () => {
		const req = new LlmRequest();
		const empty = { name: "", getDeclaration: () => ({ name: "e" }) } as any;
		const space = { name: " ", getDeclaration: () => ({ name: "s" }) } as any;
		req.appendTools([empty, space]);
		expect(req.toolsDict[""]).toBe(empty);
		expect(req.toolsDict[" "]).toBe(space);
	});

	it("second tool with the same name overwrites the first", () => {
		const req = new LlmRequest();
		const first = {
			name: "dup",
			getDeclaration: () => ({ name: "dup", n: 1 }),
		} as any;
		const second = {
			name: "dup",
			getDeclaration: () => ({ name: "dup", n: 2 }),
		} as any;
		req.appendTools([first, second]);
		expect(req.toolsDict.dup).toBe(second);
		expect(req.config?.tools?.[0]).toEqual({
			functionDeclarations: [
				{ name: "dup", n: 1 },
				{ name: "dup", n: 2 },
			],
		});
	});
});
