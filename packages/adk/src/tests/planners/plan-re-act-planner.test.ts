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
});
