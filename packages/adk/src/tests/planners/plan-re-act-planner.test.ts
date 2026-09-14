import { describe, expect, it } from "vitest";
import { PlanReActPlanner } from "../../planners/plan-re-act-planner";

describe("PlanReActPlanner", () => {
	const planner = new PlanReActPlanner();

	it("includes planning tags in the instruction", () => {
		const instruction = planner.buildPlanningInstruction({} as any, {} as any);
		expect(instruction).toContain("/*PLANNING*/");
		expect(instruction).toContain("/*ACTION*/");
		expect(instruction).toContain("/*REASONING*/");
		expect(instruction).toContain("/*FINAL_ANSWER*/");
		expect(instruction).toContain("/*REPLANNING*/");
	});

	it("returns undefined for empty responses", () => {
		expect(planner.processPlanningResponse({} as any, [])).toBeUndefined();
	});

	it("splits final answer text and marks reasoning as thought", () => {
		const parts = planner.processPlanningResponse({} as any, [
			{
				text: "/*PLANNING*/ step one /*FINAL_ANSWER*/ the answer",
			},
		]);

		expect(parts).toHaveLength(2);
		expect(parts?.[0].text).toContain("/*FINAL_ANSWER*/");
		expect(parts?.[0].thought).toBe(true);
		expect(parts?.[1].text).toBe(" the answer");
		expect(parts?.[1].thought).toBeUndefined();
	});

	it("filters empty function call names and keeps named calls", () => {
		const parts = planner.processPlanningResponse({} as any, [
			{ text: "/*REASONING*/ thinking" },
			{ functionCall: { name: "", args: {} } },
			{ functionCall: { name: "search", args: { q: "x" } } },
			{ functionCall: { name: "lookup", args: {} } },
			{ text: "after tools" },
		]);

		expect(parts?.[0].thought).toBe(true);
		expect(parts?.slice(1).map((p) => p.functionCall?.name)).toEqual([
			"search",
			"lookup",
		]);
		expect(parts?.some((p) => p.text === "after tools")).toBe(false);
	});

	it("marks /*REPLANNING*/ content as thought", () => {
		const parts = planner.processPlanningResponse({} as any, [
			{ text: "/*REPLANNING*/ revise the plan with new tools" },
		]);

		expect(parts).toHaveLength(1);
		expect(parts?.[0].text).toContain("/*REPLANNING*/");
		expect(parts?.[0].thought).toBe(true);
	});

	it("handles a response with only /*ACTION*/ text then function calls", () => {
		const parts = planner.processPlanningResponse({} as any, [
			{ text: "/*ACTION*/" },
			{ functionCall: { name: "search", args: { q: "adk" } } },
			{ functionCall: { name: "summarize", args: {} } },
		]);

		expect(parts?.[0].text).toBe("/*ACTION*/");
		expect(parts?.[0].thought).toBe(true);
		expect(parts?.slice(1).map((p) => p.functionCall?.name)).toEqual([
			"search",
			"summarize",
		]);
	});

	it("keeps planning text without FINAL_ANSWER as thought-only", () => {
		const parts = planner.processPlanningResponse({} as any, [
			{
				text: "/*PLANNING*/ outline the steps /*REASONING*/ check assumptions",
			},
		]);

		expect(parts).toHaveLength(1);
		expect(parts?.[0].thought).toBe(true);
		expect(parts?.[0].text).toContain("/*PLANNING*/");
		expect(parts?.[0].text).toContain("/*REASONING*/");
	});

	it("returns empty preserved list when only empty-name function calls exist", () => {
		const parts = planner.processPlanningResponse({} as any, [
			{ functionCall: { name: "", args: {} } },
			{ functionCall: { name: undefined as any, args: {} } },
		]);

		expect(parts ?? []).toEqual([]);
	});

	it("splits on the last /*FINAL_ANSWER*/ marker when multiple appear", () => {
		const parts = planner.processPlanningResponse({} as any, [
			{
				text: "/*PLANNING*/ draft /*FINAL_ANSWER*/ mid /*FINAL_ANSWER*/ real answer",
			},
		]);

		expect(parts).toHaveLength(2);
		expect(parts?.[0].text).toContain("/*FINAL_ANSWER*/");
		expect(parts?.[0].text).toContain("mid");
		expect(parts?.[0].thought).toBe(true);
		expect(parts?.[1].text).toBe(" real answer");
		expect(parts?.[1].thought).toBeUndefined();
	});

	it("preserves unmarked text without setting thought", () => {
		const parts = planner.processPlanningResponse({} as any, [
			{ text: "plain narration without planning tags" },
		]);

		expect(parts).toHaveLength(1);
		expect(parts?.[0].text).toBe("plain narration without planning tags");
		expect(parts?.[0].thought).toBeUndefined();
	});

	it("keeps leading function calls and ignores later non-call parts", () => {
		const parts = planner.processPlanningResponse({} as any, [
			{ functionCall: { name: "search", args: { q: "x" } } },
			{ text: "should be ignored after first call group" },
			{ functionCall: { name: "extra", args: {} } },
		]);

		expect(parts?.map((p) => p.functionCall?.name)).toEqual(["search"]);
		expect(parts?.some((p) => p.text)).toBe(false);
	});

	it("includes tool-usage and clarification guidance in the instruction", () => {
		const instruction = planner.buildPlanningInstruction({} as any, {} as any);
		expect(instruction).toContain("Available Tools");
		expect(instruction).toContain("ask for clarification");
		expect(instruction).toContain("prefer using the information available");
	});

	it("returns undefined when responseParts is nullish", () => {
		expect(
			planner.processPlanningResponse({} as any, null as any),
		).toBeUndefined();
		expect(
			planner.processPlanningResponse({} as any, undefined as any),
		).toBeUndefined();
	});

	it("keeps FINAL_ANSWER-only text without inventing an empty reasoning part", () => {
		const parts = planner.processPlanningResponse({} as any, [
			{ text: "/*FINAL_ANSWER*/ just the answer" },
		]);

		expect(parts).toHaveLength(2);
		expect(parts?.[0].text).toBe("/*FINAL_ANSWER*/");
		expect(parts?.[0].thought).toBe(true);
		expect(parts?.[1].text).toBe(" just the answer");
		expect(parts?.[1].thought).toBeUndefined();
	});

	it("preserves non-text parts without marking them as thought", () => {
		const inline = {
			inlineData: { mimeType: "text/plain", data: "abc" },
		};
		const parts = planner.processPlanningResponse({} as any, [inline as any]);

		expect(parts).toHaveLength(1);
		expect(parts?.[0]).toBe(inline);
		expect(parts?.[0].thought).toBeUndefined();
	});

	it("stops collecting consecutive function calls at the first non-call", () => {
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

	it("marks /*ACTION*/-prefixed text as thought even without a trailing space", () => {
		const parts = planner.processPlanningResponse({} as any, [
			{ text: "/*ACTION*/call_now" },
		]);
		expect(parts?.[0].thought).toBe(true);
		expect(parts?.[0].text).toBe("/*ACTION*/call_now");
	});

	it("does not mark planning tags that are not at the start of the text", () => {
		const parts = planner.processPlanningResponse({} as any, [
			{ text: "note /*PLANNING*/ x" },
		]);
		expect(parts).toHaveLength(1);
		expect(parts?.[0].text).toBe("note /*PLANNING*/ x");
		expect(parts?.[0].thought).toBeUndefined();
	});

	it("preserves empty text parts without marking them as thought", () => {
		const parts = planner.processPlanningResponse({} as any, [
			{ text: "" },
			{ text: "/*REASONING*/ later" },
		]);
		expect(parts?.[0].text).toBe("");
		expect(parts?.[0].thought).toBeUndefined();
		expect(parts?.[1].thought).toBe(true);
	});

	it("splits FINAL_ANSWER text then collects following function call group", () => {
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
		expect(parts?.[0].thought).toBe(true);
		expect(parts?.[1].thought).toBeUndefined();
	});

	it("keeps reasoning-only when FINAL_ANSWER tag has an empty answer trailer", () => {
		const parts = planner.processPlanningResponse({} as any, [
			{ text: "plan /*FINAL_ANSWER*/" },
		]);
		expect(parts).toHaveLength(1);
		expect(parts?.[0].text).toBe("plan /*FINAL_ANSWER*/");
		expect(parts?.[0].thought).toBe(true);
	});

	it("returns undefined for null responseParts", () => {
		expect(
			planner.processPlanningResponse({} as any, null as any),
		).toBeUndefined();
	});

	it("does not mark REASONING/ACTION/REPLANNING tags when they are not at the start", () => {
		const parts = planner.processPlanningResponse({} as any, [
			{ text: "lead /*REASONING*/ mid" },
			{ text: "lead /*ACTION*/ mid" },
			{ text: "lead /*REPLANNING*/ mid" },
			{ text: "lead /*PLANNING*/ mid" },
		]);

		expect(parts).toHaveLength(4);
		for (const part of parts ?? []) {
			expect(part.thought).toBeUndefined();
		}
		expect(parts?.map((p) => p.text)).toEqual([
			"lead /*REASONING*/ mid",
			"lead /*ACTION*/ mid",
			"lead /*REPLANNING*/ mid",
			"lead /*PLANNING*/ mid",
		]);
	});

	it("preserves a lone empty text part without inventing thought", () => {
		const parts = planner.processPlanningResponse({} as any, [{ text: "" }]);
		expect(parts).toHaveLength(1);
		expect(parts?.[0].text).toBe("");
		expect(parts?.[0].thought).toBeUndefined();
	});

	it("handles empty text then FINAL_ANSWER split then function calls skipping empty names", () => {
		const parts = planner.processPlanningResponse({} as any, [
			{ text: "" },
			{ text: "/*PLANNING*/ steps /*FINAL_ANSWER*/ result" },
			{ functionCall: { name: "", args: {} } },
			{ functionCall: { name: "search", args: { q: "x" } } },
			{ functionCall: { name: "lookup", args: {} } },
			{ text: "ignored after fc group" },
			{ functionCall: { name: "late", args: {} } },
		]);

		expect(parts?.map((p) => p.functionCall?.name || p.text)).toEqual([
			"",
			"/*PLANNING*/ steps /*FINAL_ANSWER*/",
			" result",
			"search",
			"lookup",
		]);
		expect(parts?.[0].thought).toBeUndefined();
		expect(parts?.[1].thought).toBe(true);
		expect(parts?.[2].thought).toBeUndefined();
	});

	it("omits trailing empty FINAL_ANSWER segment and still marks reasoning as thought", () => {
		const parts = planner.processPlanningResponse({} as any, [
			{ text: "/*REASONING*/ almost /*FINAL_ANSWER*/" },
			{ functionCall: { name: "search", args: { q: "y" } } },
		]);

		expect(parts).toHaveLength(2);
		expect(parts?.[0].text).toBe("/*REASONING*/ almost /*FINAL_ANSWER*/");
		expect(parts?.[0].thought).toBe(true);
		expect(parts?.[1].functionCall?.name).toBe("search");
		expect(parts?.some((p) => p.text === "")).toBe(false);
	});

	it("_splitByLastPattern returns [text, ''] when separator is missing", () => {
		expect(
			(planner as any)._splitByLastPattern(
				"no marker here",
				"/*FINAL_ANSWER*/",
			),
		).toEqual(["no marker here", ""]);
		expect(
			(planner as any)._splitByLastPattern("", "/*FINAL_ANSWER*/"),
		).toEqual(["", ""]);
		expect(
			(planner as any)._splitByLastPattern("short", "much-longer-separator"),
		).toEqual(["short", ""]);
	});

	it("_splitByLastPattern splits on the last separator occurrence", () => {
		expect(
			(planner as any)._splitByLastPattern(
				"a /*FINAL_ANSWER*/ b /*FINAL_ANSWER*/ c",
				"/*FINAL_ANSWER*/",
			),
		).toEqual(["a /*FINAL_ANSWER*/ b /*FINAL_ANSWER*/", " c"]);
	});

	it("_handleNonFunctionCallParts preserves non-text parts without thought", () => {
		const preserved: any[] = [];
		(planner as any)._handleNonFunctionCallParts(
			{ inlineData: { data: "x", mimeType: "text/plain" } },
			preserved,
		);
		expect(preserved).toHaveLength(1);
		expect(preserved[0].thought).toBeUndefined();
		expect(preserved[0].inlineData?.data).toBe("x");
	});

	it("_markAsThought is a no-op when text is missing", () => {
		const part: any = { functionCall: { name: "x", args: {} } };
		(planner as any)._markAsThought(part);
		expect(part.thought).toBeUndefined();
	});

	it("processes mixed planning/reasoning/action/replanning/final-answer with FC groups", () => {
		const parts = planner.processPlanningResponse({} as any, [
			{ text: "/*PLANNING*/ step 1" },
			{ text: "/*REASONING*/ observe" },
			{ text: "/*ACTION*/ prepare" },
			{ text: "/*REPLANNING*/ revise" },
			{
				text: "/*REASONING*/ almost /*FINAL_ANSWER*/ done-answer",
			},
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

	it("returns undefined for empty and nullish responseParts", () => {
		expect(planner.processPlanningResponse({} as any, [])).toBeUndefined();
		expect(
			planner.processPlanningResponse({} as any, undefined as any),
		).toBeUndefined();
		expect(
			planner.processPlanningResponse({} as any, null as any),
		).toBeUndefined();
	});

	it("buildPlanningInstruction includes all required tags and preambles", () => {
		const instruction = planner.buildPlanningInstruction({} as any, {} as any);
		for (const tag of [
			"/*PLANNING*/",
			"/*REPLANNING*/",
			"/*REASONING*/",
			"/*ACTION*/",
			"/*FINAL_ANSWER*/",
		]) {
			expect(instruction).toContain(tag);
		}
		expect(instruction).toContain("Available Tools");
		expect(instruction).toContain("VERY IMPORTANT instruction");
		expect(instruction).toContain("revised plan");
	});

	it("stops FC group collection on the first non-function-call part", () => {
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
});

describe("PlanReActPlanner leftover edges", () => {
	const planner = new PlanReActPlanner();

	it("buildPlanningInstruction mentions tool usage and final answer requirements", () => {
		const instruction = planner.buildPlanningInstruction({} as any, {} as any);
		expect(instruction).toContain("Available Tools");
		expect(instruction).toContain("FINAL_ANSWER");
		expect(instruction).toContain("REPLANNING");
	});

	it("processPlanningResponse returns the first function-call group when no text precedes it", () => {
		const parts = planner.processPlanningResponse({} as any, [
			{ functionCall: { name: "search", args: { q: "x" } } },
			{ functionCall: { name: "fetch", args: {} } },
		]);
		expect(parts?.map((p) => p.functionCall?.name)).toEqual(["search"]);
	});

	it("treats leading whitespace before PLANNING tag as non-thought", () => {
		const parts = planner.processPlanningResponse({} as any, [
			{ text: "   /*PLANNING*/ plan" },
		]);
		expect(parts).toHaveLength(1);
		expect(parts?.[0].thought).toBeUndefined();
	});

	it("splits when FINAL_ANSWER is the first non-empty segment", () => {
		const parts = planner.processPlanningResponse({} as any, [
			{ text: "/*FINAL_ANSWER*/ only answer" },
		]);
		expect(parts).toHaveLength(2);
		expect(parts?.[0].text).toBe("/*FINAL_ANSWER*/");
		expect(parts?.[0].thought).toBe(true);
		expect(parts?.[1].text).toBe(" only answer");
	});

	it("filters function calls whose names are nullish", () => {
		const parts = planner.processPlanningResponse({} as any, [
			{ functionCall: { name: null as any, args: {} } },
			{ functionCall: { name: "valid", args: {} } },
		]);
		expect(parts?.map((p) => p.functionCall?.name)).toEqual(["valid"]);
	});

	it("preserves REASONING tag part when it is the only content", () => {
		const parts = planner.processPlanningResponse({} as any, [
			{ text: "/*REASONING*/ think deeply" },
		]);
		expect(parts).toHaveLength(1);
		expect(parts?.[0].thought).toBe(true);
		expect(parts?.[0].text).toContain("think deeply");
	});
});
