import { Type } from "@google/genai";
import { describe, expect, it, vi } from "vitest";
import { GoogleSearch } from "../../../tools/common/google-search";
import type { ToolContext } from "../../../tools/tool-context";

function makeContext(actions?: Record<string, unknown>): ToolContext {
	return { actions: actions ?? {} } as ToolContext;
}

describe("GoogleSearchTool fourth leftover declaration/run matrices", () => {
	it("locks google_search metadata and declaration shape", () => {
		const tool = new GoogleSearch();
		const declaration = tool.getDeclaration();
		expect(tool.name).toBe("google_search");
		expect(tool.description).toBe("Search the web using Google");
		expect(tool.isLongRunning).toBe(false);
		expect(tool.shouldRetryOnFailure).toBe(false);
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

	const queryMatrix = [
		"adk",
		"",
		"  ",
		"café",
		"検索",
		'quote "marks"',
		"line\nbreak",
		"a".repeat(80),
		"123 numbers",
		"special <>&",
	];

	for (const query of queryMatrix) {
		it(`declaration-stable run embeds query ${JSON.stringify(query)}`, async () => {
			const tool = new GoogleSearch();
			const result = await tool.runAsync({ query }, makeContext());
			expect(Object.keys(result)).toEqual(["results"]);
			expect(result.results).toHaveLength(2);
			expect(result.results[0]).toEqual({
				title: `Result 1 for ${query}`,
				link: "https://example.com/1",
				snippet: `This is a sample result for the query "${query}".`,
			});
			expect(result.results[1]).toEqual({
				title: `Result 2 for ${query}`,
				link: "https://example.com/2",
				snippet: `Another sample result for "${query}".`,
			});
		});
	}

	const numResultsMatrix = [undefined, 0, 1, 5, 10, 100, -1, 2.5, Number.NaN];

	for (const num_results of numResultsMatrix) {
		it(`always returns two mock results for num_results=${String(num_results)}`, async () => {
			const tool = new GoogleSearch();
			const args =
				num_results === undefined
					? { query: "fixed" }
					: { query: "fixed", num_results: num_results as number };
			const result = await tool.runAsync(args, makeContext());
			expect(result.results).toHaveLength(2);
			expect(result.results[0].link).toBe("https://example.com/1");
			expect(result.results[1].link).toBe("https://example.com/2");
		});
	}

	it("does not mutate context actions", async () => {
		const tool = new GoogleSearch();
		const context = makeContext({ escalate: true, transferToAgent: "x" });
		await tool.runAsync({ query: "noop" }, context);
		expect(context.actions).toEqual({ escalate: true, transferToAgent: "x" });
	});

	it("works with bare context without actions", async () => {
		const tool = new GoogleSearch();
		const result = await tool.runAsync({ query: "bare" }, {} as ToolContext);
		expect(result.results).toHaveLength(2);
	});

	it("result item keys are exactly title/link/snippet", async () => {
		const tool = new GoogleSearch();
		const result = await tool.runAsync({ query: "keys" }, makeContext());
		for (const item of result.results) {
			expect(Object.keys(item).sort()).toEqual(["link", "snippet", "title"]);
		}
	});

	it("returns a fresh results array each call", async () => {
		const tool = new GoogleSearch();
		const a = await tool.runAsync({ query: "a" }, makeContext());
		const b = await tool.runAsync({ query: "b" }, makeContext());
		expect(a.results).not.toBe(b.results);
		expect(a.results[0].title).toContain("a");
		expect(b.results[0].title).toContain("b");
	});

	it("logs the query via debug", async () => {
		const tool = new GoogleSearch();
		const debug = vi
			.spyOn((tool as any).logger, "debug")
			.mockImplementation(() => {});
		await tool.runAsync({ query: "logged" }, makeContext());
		expect(debug).toHaveBeenCalledWith(expect.stringContaining("logged"));
	});

	it("getDeclaration is stable across calls", () => {
		const tool = new GoogleSearch();
		const a = tool.getDeclaration();
		const b = tool.getDeclaration();
		expect(a).toEqual(b);
		expect(a.parameters?.required).toEqual(["query"]);
	});
});
