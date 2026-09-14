import { describe, expect, it } from "vitest";
import { Type } from "@google/genai";
import { GoogleSearch } from "../../../tools/common/google-search";
import type { ToolContext } from "../../../tools/tool-context";

function makeContext(): ToolContext {
	return {} as ToolContext;
}

describe("GoogleSearch (declaration + mock contract)", () => {
	it("exposes google_search declaration schema", () => {
		const tool = new GoogleSearch();
		const declaration = tool.getDeclaration();

		expect(tool.name).toBe("google_search");
		expect(declaration?.name).toBe("google_search");
		expect(declaration?.description).toContain("Search the web");
		expect(declaration?.parameters?.type).toBe(Type.OBJECT);
		expect(declaration?.parameters?.required).toEqual(["query"]);
		expect(declaration?.parameters?.properties?.query?.type).toBe(Type.STRING);
		expect(declaration?.parameters?.properties?.num_results?.type).toBe(
			Type.INTEGER,
		);
		expect(declaration?.parameters?.properties?.num_results?.default).toBe(5);
	});

	it("returns mock search results from runAsync", async () => {
		const tool = new GoogleSearch();
		const result = await tool.runAsync(
			{ query: "adk", num_results: 2 },
			makeContext(),
		);

		expect(result.results).toHaveLength(2);
		expect(result.results[0].title).toContain("adk");
		expect(result.results[0].link).toMatch(/^https:\/\//);
		expect(result.results[1].snippet).toContain("adk");
	});

	it("ignores num_results and always yields the fixed mock payload shape", async () => {
		const tool = new GoogleSearch();
		const result = await tool.runAsync(
			{ query: "shape", num_results: 10 },
			makeContext(),
		);

		expect(Object.keys(result)).toEqual(["results"]);
		for (const item of result.results) {
			expect(Object.keys(item).sort()).toEqual(["link", "snippet", "title"]);
			expect(typeof item.title).toBe("string");
			expect(typeof item.link).toBe("string");
			expect(typeof item.snippet).toBe("string");
		}
	});

	it("works when context is a bare object without actions", async () => {
		const tool = new GoogleSearch();
		const result = await tool.runAsync({ query: "bare" }, {} as ToolContext);
		expect(result.results).toHaveLength(2);
	});

	it("produces distinct titles for result 1 and result 2", async () => {
		const tool = new GoogleSearch();
		const result = await tool.runAsync({ query: "distinct" }, makeContext());
		expect(result.results[0].title).not.toBe(result.results[1].title);
		expect(result.results[0].link).not.toBe(result.results[1].link);
	});

	it("uses different snippet templates for result 1 and result 2", async () => {
		const tool = new GoogleSearch();
		const result = await tool.runAsync({ query: "tmpl" }, makeContext());
		expect(result.results[0].snippet).toContain("sample result");
		expect(result.results[1].snippet).toContain("Another sample result");
		expect(result.results[0].snippet).not.toBe(result.results[1].snippet);
	});

	it("does not require actions on the tool context", async () => {
		const tool = new GoogleSearch();
		const result = await tool.runAsync(
			{ query: "no-actions", num_results: undefined },
			{ actions: undefined } as unknown as ToolContext,
		);
		expect(result.results).toHaveLength(2);
	});

	it("keeps link hosts on example.com for any query length", async () => {
		const tool = new GoogleSearch();
		const query = "q".repeat(500);
		const result = await tool.runAsync({ query }, makeContext());
		expect(result.results[0].link).toBe("https://example.com/1");
		expect(result.results[1].link).toBe("https://example.com/2");
		expect(result.results[0].title.length).toBeGreaterThan(500);
	});
});
