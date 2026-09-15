import { describe, expect, it, vi } from "vitest";
import { LlmAgent } from "../../agents/llm-agent";
import { Event } from "../../events/event";

/**
 * Twenty-second leftover (HEAVY residual complement after open #265 /
 * twentieth tools/outputKey tip): Assert `tools || []` keeps number `1` /
 * `{}`; `NaN` coalesces to `[]`. outputKey `1` / `{}` write under coerced
 * keys; `NaN` is falsy and skips write.
 */
describe("LlmAgent tools/outputKey number-one/empty-object/NaN twenty-second leftover", () => {
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
		{ label: "number 1", value: 1 },
		{ label: "empty-object", value: {} },
	])("tools $label is kept via || (not coalesced to [])", ({ value }) => {
		const agent = new LlmAgent({
			name: "tools_one",
			tools: value as any,
		});
		expect(agent.tools).toBe(value);
		expect(Array.isArray(agent.tools)).toBe(false);
	});

	it("tools NaN still coalesces to []", () => {
		const agent = new LlmAgent({
			name: "tools_nan",
			tools: Number.NaN as any,
		});
		expect(agent.tools).toEqual([]);
	});

	it('outputKey number 1 is truthy and writes under key "1"', () => {
		const agent = new LlmAgent({ name: "owner", outputKey: 1 as any });
		const event = save(agent, "kept-under-1");
		expect(event.actions.stateDelta?.[1 as any]).toBe("kept-under-1");
		expect((event.actions.stateDelta as any)["1"]).toBe("kept-under-1");
	});

	it('outputKey empty-object writes under key "[object Object]"', () => {
		const empty = {};
		const agent = new LlmAgent({ name: "owner", outputKey: empty as any });
		const event = save(agent, "kept-under-obj");
		expect((event.actions.stateDelta as any)["[object Object]"]).toBe(
			"kept-under-obj",
		);
	});

	it("outputKey NaN is falsy and skips write", () => {
		const agent = new LlmAgent({
			name: "owner",
			outputKey: Number.NaN as any,
		});
		const event = save(agent, "skipped");
		expect(event.actions.stateDelta).toEqual({});
	});
});
