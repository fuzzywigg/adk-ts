import { describe, expect, it } from "vitest";
import { Type } from "@google/genai";
import { GoogleSearch } from "../../../tools/common/google-search";
import type { ToolContext } from "../../../tools/tool-context";

function makeContext(): ToolContext {
	return {} as ToolContext;
}

describe("GoogleSearch", () => {
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

	it("ignores num_results for the mock implementation length", async () => {
		const tool = new GoogleSearch();
		const result = await tool.runAsync(
			{ query: "typescript", num_results: 10 },
			makeContext(),
		);
		expect(result.results).toHaveLength(2);
	});

	it("returns two results when num_results is omitted", async () => {
		const tool = new GoogleSearch();
		const result = await tool.runAsync({ query: "agents" }, makeContext());
		expect(result.results).toHaveLength(2);
		expect(result.results[0]).toEqual(
			expect.objectContaining({
				title: expect.stringContaining("agents"),
				link: "https://example.com/1",
				snippet: expect.stringContaining("agents"),
			}),
		);
		expect(result.results[1].link).toBe("https://example.com/2");
	});

	it("declares num_results default of 5", () => {
		const tool = new GoogleSearch();
		expect(tool.getDeclaration().parameters?.properties?.num_results).toEqual(
			expect.objectContaining({ default: 5 }),
		);
	});
});
