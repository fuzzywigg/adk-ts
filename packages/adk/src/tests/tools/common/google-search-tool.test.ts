import { Type } from "@google/genai";
import { describe, expect, it } from "vitest";
import { GoogleSearch } from "../../../tools/common/google-search";
import type { ToolContext } from "../../../tools/tool-context";

function makeContext(): ToolContext {
	return { actions: {} } as ToolContext;
}

describe("GoogleSearch", () => {
	it("exposes google_search metadata", () => {
		const tool = new GoogleSearch();

		expect(tool.name).toBe("google_search");
		expect(tool.description).toBe("Search the web using Google");
	});

	it("declares query as required and num_results as optional", () => {
		const tool = new GoogleSearch();
		const declaration = tool.getDeclaration();

		expect(declaration.name).toBe("google_search");
		expect(declaration.parameters?.type).toBe(Type.OBJECT);
		expect(declaration.parameters?.required).toEqual(["query"]);
		expect(declaration.parameters?.properties?.query).toEqual({
			type: Type.STRING,
			description: "The search query to execute",
		});
		expect(declaration.parameters?.properties?.num_results).toEqual({
			type: Type.INTEGER,
			description: "Number of results to return (max 10)",
			default: 5,
		});
	});

	it("returns mock results that include the query", async () => {
		const tool = new GoogleSearch();
		const result = await tool.runAsync(
			{ query: "adk typescript" },
			makeContext(),
		);

		expect(result.results).toHaveLength(2);
		expect(result.results[0].title).toContain("adk typescript");
		expect(result.results[0].snippet).toContain("adk typescript");
		expect(result.results[1].title).toContain("adk typescript");
		expect(result.results[1].snippet).toContain("adk typescript");
		expect(result.results[0].link).toMatch(/^https:\/\//);
	});
});
