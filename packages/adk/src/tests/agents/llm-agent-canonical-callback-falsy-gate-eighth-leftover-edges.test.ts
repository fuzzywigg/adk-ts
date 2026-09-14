import { describe, expect, it } from "vitest";
import { LlmAgent } from "../../agents/llm-agent";

/**
 * Eighth leftover: canonical*Callbacks use `if (!this.*Callback) return []`.
 * Prior leftovers only pinned undefined/omitted; falsy 0/false/"" also gate.
 */
describe("LlmAgent canonical callback falsy gate eighth leftover", () => {
	const getters = [
		{
			field: "beforeModelCallback",
			getter: "canonicalBeforeModelCallbacks",
		},
		{
			field: "afterModelCallback",
			getter: "canonicalAfterModelCallbacks",
		},
		{
			field: "beforeToolCallback",
			getter: "canonicalBeforeToolCallbacks",
		},
		{
			field: "afterToolCallback",
			getter: "canonicalAfterToolCallbacks",
		},
	] as const;

	it.each([
		{ label: "0", value: 0 },
		{ label: "false", value: false },
		{ label: '""', value: "" },
		{ label: "null", value: null },
	])("$label callback fields return [] via !gate", ({ value }) => {
		for (const { field, getter } of getters) {
			const agent = new LlmAgent({
				name: `cb_${field}_${String(value)}`,
				[field]: value,
			} as any);
			expect((agent as any)[getter]).toEqual([]);
		}
	});

	it("empty array is truthy so canonical returns the same array ref", () => {
		const empty: never[] = [];
		const agent = new LlmAgent({
			name: "cb_empty_arr",
			beforeModelCallback: empty as any,
			afterModelCallback: empty as any,
			beforeToolCallback: empty as any,
			afterToolCallback: empty as any,
		});
		expect(agent.canonicalBeforeModelCallbacks).toBe(empty);
		expect(agent.canonicalAfterModelCallbacks).toBe(empty);
		expect(agent.canonicalBeforeToolCallbacks).toBe(empty);
		expect(agent.canonicalAfterToolCallbacks).toBe(empty);
	});
});
