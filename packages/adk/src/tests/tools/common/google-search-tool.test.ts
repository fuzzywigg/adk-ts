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
		expect(tool.isLongRunning).toBe(false);
		expect(tool.shouldRetryOnFailure).toBe(false);
	});

	it("declares query as required and num_results as optional", () => {
		const tool = new GoogleSearch();
		const declaration = tool.getDeclaration();

		expect(declaration.name).toBe("google_search");
		expect(declaration.description).toBe(tool.description);
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
		expect(result.results[0]).toEqual({
			title: "Result 1 for adk typescript",
			link: "https://example.com/1",
			snippet: 'This is a sample result for the query "adk typescript".',
		});
		expect(result.results[1]).toEqual({
			title: "Result 2 for adk typescript",
			link: "https://example.com/2",
			snippet: 'Another sample result for "adk typescript".',
		});
	});

	it("always returns exactly two mock results regardless of num_results", async () => {
		const tool = new GoogleSearch();

		for (const num_results of [1, 5, 10, 100, 0]) {
			const result = await tool.runAsync(
				{ query: "ignore-count", num_results },
				makeContext(),
			);
			expect(result.results).toHaveLength(2);
		}
	});

	it("embeds empty query into titles and snippets", async () => {
		const tool = new GoogleSearch();
		const result = await tool.runAsync({ query: "" }, makeContext());

		expect(result.results[0].title).toBe("Result 1 for ");
		expect(result.results[0].snippet).toContain('""');
		expect(result.results[1].title).toBe("Result 2 for ");
	});

	it("does not mutate the tool context actions", async () => {
		const tool = new GoogleSearch();
		const context = {
			actions: { escalate: true },
		} as ToolContext;

		await tool.runAsync({ query: "x" }, context);

		expect(context.actions).toEqual({ escalate: true });
	});

	it("uses stable example.com links for both results", async () => {
		const tool = new GoogleSearch();
		const result = await tool.runAsync({ query: "links" }, makeContext());

		expect(result.results.map((r: { link: string }) => r.link)).toEqual([
			"https://example.com/1",
			"https://example.com/2",
		]);
	});

	it("interpolates special characters in the query into result text", async () => {
		const tool = new GoogleSearch();
		const query = 'foo & bar <baz> "qux"';
		const result = await tool.runAsync({ query }, makeContext());

		expect(result.results[0].title).toContain(query);
		expect(result.results[0].snippet).toContain(query);
		expect(result.results[1].snippet).toContain(query);
	});
});
