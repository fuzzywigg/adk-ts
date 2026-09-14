import { describe, expect, it } from "vitest";
import { PlanReActPlanner } from "../../planners/plan-re-act-planner";

describe("PlanReActPlanner edges", () => {
	const planner = new PlanReActPlanner();

	describe("empty / undefined responseParts", () => {
		it.each([
			{ label: "empty array", parts: [] as any[] },
			{ label: "undefined", parts: undefined as any },
			{ label: "null", parts: null as any },
		])("returns undefined for $label", ({ parts }) => {
			expect(planner.processPlanningResponse({} as any, parts)).toBeUndefined();
		});
	});

	describe("function call name filtering", () => {
		it.each([
			{ name: "", label: "empty string" },
			{ name: undefined as any, label: "undefined" },
			{ name: null as any, label: "null" },
		])("skips function calls whose name is $label", ({ name }) => {
			const parts = planner.processPlanningResponse({} as any, [
				{ functionCall: { name, args: {} } },
				{ functionCall: { name: "valid", args: { q: 1 } } },
			]);
			expect(parts?.map((p) => p.functionCall?.name)).toEqual(["valid"]);
		});

		it("returns empty preserved list when only invalid-name calls exist", () => {
			const parts = planner.processPlanningResponse({} as any, [
				{ functionCall: { name: "", args: {} } },
				{ functionCall: { name: undefined as any, args: {} } },
			]);
			expect(parts ?? []).toEqual([]);
		});
	});

	describe("text || '' for non-tag parts", () => {
		it("preserves parts with undefined text via empty-string fallback", () => {
			const parts = planner.processPlanningResponse({} as any, [
				{ text: undefined as any },
			]);
			expect(parts).toHaveLength(1);
			expect(parts?.[0].text).toBeUndefined();
			expect(parts?.[0].thought).toBeUndefined();
		});

		it("does not mark whitespace-prefixed planning tags as thought", () => {
			const parts = planner.processPlanningResponse({} as any, [
				{ text: "   /*PLANNING*/ indented" },
			]);
			expect(parts?.[0].thought).toBeUndefined();
		});

		it("preserves plain narration without thought marking", () => {
			const parts = planner.processPlanningResponse({} as any, [
				{ text: "plain narration without planning tags" },
			]);
			expect(parts?.[0].text).toBe("plain narration without planning tags");
			expect(parts?.[0].thought).toBeUndefined();
		});
	});

	describe("tag startsWith matrix", () => {
		const tags = [
			{ tag: "/*PLANNING*/", label: "PLANNING" },
			{ tag: "/*REASONING*/", label: "REASONING" },
			{ tag: "/*ACTION*/", label: "ACTION" },
			{ tag: "/*REPLANNING*/", label: "REPLANNING" },
		];

		it.each(tags)("marks $label at text start as thought", ({ tag }) => {
			const parts = planner.processPlanningResponse({} as any, [
				{ text: `${tag} body` },
			]);
			expect(parts?.[0].thought).toBe(true);
			expect(parts?.[0].text).toContain(tag);
		});

		it.each(tags)("does not mark $label when not at text start", ({ tag }) => {
			const parts = planner.processPlanningResponse({} as any, [
				{ text: `prefix ${tag} suffix` },
			]);
			expect(parts?.[0].thought).toBeUndefined();
		});
	});

	describe("FINAL_ANSWER split", () => {
		it("splits reasoning and final answer and marks reasoning as thought", () => {
			const parts = planner.processPlanningResponse({} as any, [
				{ text: "/*PLANNING*/ step /*FINAL_ANSWER*/ the answer" },
			]);
			expect(parts).toHaveLength(2);
			expect(parts?.[0].text).toContain("/*FINAL_ANSWER*/");
			expect(parts?.[0].thought).toBe(true);
			expect(parts?.[1].text).toBe(" the answer");
			expect(parts?.[1].thought).toBeUndefined();
		});

		it("omits empty reasoning segment when marker is at start", () => {
			const parts = planner.processPlanningResponse({} as any, [
				{ text: "/*FINAL_ANSWER*/ only answer" },
			]);
			expect(parts).toHaveLength(2);
			expect(parts?.[0].text).toBe("/*FINAL_ANSWER*/");
			expect(parts?.[0].thought).toBe(true);
			expect(parts?.[1].text).toBe(" only answer");
		});

		it("omits empty final segment when marker has no trailing text", () => {
			const parts = planner.processPlanningResponse({} as any, [
				{ text: "plan /*FINAL_ANSWER*/" },
			]);
			expect(parts).toHaveLength(1);
			expect(parts?.[0].text).toBe("plan /*FINAL_ANSWER*/");
			expect(parts?.[0].thought).toBe(true);
		});

		it("splits on the last FINAL_ANSWER marker when multiple appear", () => {
			const parts = planner.processPlanningResponse({} as any, [
				{
					text: "/*PLANNING*/ draft /*FINAL_ANSWER*/ mid /*FINAL_ANSWER*/ real",
				},
			]);
			expect(parts).toHaveLength(2);
			expect(parts?.[0].text).toContain("mid");
			expect(parts?.[1].text).toBe(" real");
		});
	});

	describe("non-text parts passthrough", () => {
		it("preserves inlineData without thought marking", () => {
			const inline = {
				inlineData: { mimeType: "text/plain", data: "abc" },
			};
			const parts = planner.processPlanningResponse({} as any, [inline as any]);
			expect(parts).toHaveLength(1);
			expect(parts?.[0]).toBe(inline);
			expect(parts?.[0].thought).toBeUndefined();
		});

		it("_handleNonFunctionCallParts keeps non-text parts unchanged", () => {
			const preserved: any[] = [];
			(planner as any)._handleNonFunctionCallParts(
				{ inlineData: { data: "x", mimeType: "text/plain" } },
				preserved,
			);
			expect(preserved).toHaveLength(1);
			expect(preserved[0].thought).toBeUndefined();
		});
	});

	describe("firstFcPartIndex === 0 vs > 0", () => {
		it("returns only the first FC when no text precedes calls (index 0)", () => {
			const parts = planner.processPlanningResponse({} as any, [
				{ functionCall: { name: "search", args: { q: "x" } } },
				{ functionCall: { name: "fetch", args: {} } },
				{ text: "ignored after group" },
			]);
			expect(parts?.map((p) => p.functionCall?.name)).toEqual(["search"]);
		});

		it("collects consecutive FCs after text when firstFcPartIndex > 0", () => {
			const parts = planner.processPlanningResponse({} as any, [
				{ text: "/*REASONING*/ before tools" },
				{ functionCall: { name: "search", args: { q: "a" } } },
				{ functionCall: { name: "fetch", args: { url: "u" } } },
				{ text: "interleaved text" },
				{ functionCall: { name: "late", args: {} } },
			]);
			expect(parts?.map((p) => p.functionCall?.name || p.text)).toEqual([
				"/*REASONING*/ before tools",
				"search",
				"fetch",
			]);
			expect(parts?.[0].thought).toBe(true);
		});

		it("groups FCs after FINAL_ANSWER split when index > 0", () => {
			const parts = planner.processPlanningResponse({} as any, [
				{ text: "/*REASONING*/ prep /*FINAL_ANSWER*/ done" },
				{ functionCall: { name: "search", args: { q: "a" } } },
				{ functionCall: { name: "fetch", args: { url: "u" } } },
				{ text: "after" },
			]);
			expect(parts?.map((p) => p.functionCall?.name || p.text)).toEqual([
				"/*REASONING*/ prep /*FINAL_ANSWER*/",
				" done",
				"search",
				"fetch",
			]);
		});
	});

	describe("break on non-FC after FCs", () => {
		it("stops FC group at first non-function-call part", () => {
			const parts = planner.processPlanningResponse({} as any, [
				{ text: "/*ACTION*/ go" },
				{ functionCall: { name: "first", args: {} } },
				{ text: "interrupt" },
				{ functionCall: { name: "second", args: {} } },
			]);
			expect(parts?.map((p) => p.functionCall?.name || p.text)).toEqual([
				"/*ACTION*/ go",
				"first",
			]);
		});

		it("ignores trailing text after a leading-only FC group", () => {
			const parts = planner.processPlanningResponse({} as any, [
				{ functionCall: { name: "search", args: { q: "x" } } },
				{ text: "should be ignored" },
				{ functionCall: { name: "extra", args: {} } },
			]);
			expect(parts?.map((p) => p.functionCall?.name)).toEqual(["search"]);
			expect(parts?.some((p) => p.text)).toBe(false);
		});
	});

	describe("_splitByLastPattern and _markAsThought", () => {
		it("returns [text, ''] when separator is absent", () => {
			expect(
				(planner as any)._splitByLastPattern("no marker", "/*FINAL_ANSWER*/"),
			).toEqual(["no marker", ""]);
		});

		it("_markAsThought is a no-op when text is missing", () => {
			const part: any = { functionCall: { name: "x", args: {} } };
			(planner as any)._markAsThought(part);
			expect(part.thought).toBeUndefined();
		});
	});

	describe("mixed end-to-end matrix", () => {
		it("handles planning/reasoning/action/replanning/final-answer with FC groups", () => {
			const parts = planner.processPlanningResponse({} as any, [
				{ text: "/*PLANNING*/ step 1" },
				{ text: "/*REASONING*/ observe" },
				{ text: "/*ACTION*/ prepare" },
				{ text: "/*REPLANNING*/ revise" },
				{ text: "/*REASONING*/ almost /*FINAL_ANSWER*/ done-answer" },
				{ functionCall: { name: "", args: {} } },
				{ functionCall: { name: "tool_a", args: { n: 1 } } },
				{ functionCall: { name: "tool_b", args: { n: 2 } } },
				{ text: "trailing ignored" },
				{ functionCall: { name: "late", args: {} } },
			]);
			expect(parts?.map((p) => p.functionCall?.name || p.text)).toEqual([
				"/*PLANNING*/ step 1",
				"/*REASONING*/ observe",
				"/*ACTION*/ prepare",
				"/*REPLANNING*/ revise",
				"/*REASONING*/ almost /*FINAL_ANSWER*/",
				" done-answer",
				"tool_a",
				"tool_b",
			]);
			expect(parts?.slice(0, 5).every((p) => p.thought === true)).toBe(true);
			expect(parts?.[5].thought).toBeUndefined();
		});
	});
});
