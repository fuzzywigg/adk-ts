import { describe, expect, it, vi } from "vitest";
import { LlmAgent } from "../../agents/llm-agent";
import { Event } from "../../events/event";

/**
 * Twenty-second leftover (HEAVY tip-relaunch residual after tip #258–#261):
 * twentieth pins tools true/`"true"`/`-0` and outputKey true/`"true"`.
 * Assert ±Infinity tools keep via `|| []`; outputKey ±Infinity / `-0`
 * write asymmetries — residual sentinel deepen.
 */
describe("LlmAgent tools/outputKey infinity twenty-second leftover", () => {
	function save(agent: LlmAgent, text: string): Event {
		const event = new Event({
			author: agent.name,
			content: { parts: [{ text }] },
		});
		vi.spyOn(event, "isFinalResponse").mockReturnValue(true);
		agent["maybeSaveOutputToState"](event);
		return event;
	}

	it.each([
		{ label: "POSITIVE_INFINITY", value: Number.POSITIVE_INFINITY },
		{ label: "NEGATIVE_INFINITY", value: Number.NEGATIVE_INFINITY },
	])("tools $label is kept via || (not coalesced to [])", ({ value }) => {
		const agent = new LlmAgent({
			name: "tools_inf",
			tools: value as any,
		});
		expect(agent.tools).toBe(value);
		expect(Array.isArray(agent.tools)).toBe(false);
	});

	it("tools empty-array is kept (truthy ||)", () => {
		const empty: never[] = [];
		const agent = new LlmAgent({ name: "tools_arr", tools: empty as any });
		expect(agent.tools).toBe(empty);
	});

	it("SameValueZero -0 tools still coalesces to [] (twentieth control)", () => {
		const agent = new LlmAgent({ name: "tools_neg0", tools: -0 as any });
		expect(agent.tools).toEqual([]);
	});

	it.each([
		{
			label: "POSITIVE_INFINITY",
			value: Number.POSITIVE_INFINITY,
			key: "Infinity",
		},
		{
			label: "NEGATIVE_INFINITY",
			value: Number.NEGATIVE_INFINITY,
			key: "-Infinity",
		},
	])("outputKey $label coerces to stateDelta key '$key'", ({ value, key }) => {
		const agent = new LlmAgent({ name: "owner", outputKey: value as any });
		const event = save(agent, "inf-key");
		expect(event.actions.stateDelta?.[key]).toBe("inf-key");
	});

	it("SameValueZero -0 outputKey is falsy and skips state write", () => {
		const agent = new LlmAgent({ name: "owner", outputKey: -0 as any });
		const event = save(agent, "should-skip");
		expect(event.actions.stateDelta).toBeUndefined();
	});
});
