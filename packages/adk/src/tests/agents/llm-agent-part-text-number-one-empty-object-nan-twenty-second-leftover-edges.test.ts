import { beforeEach, describe, expect, it, vi } from "vitest";
import { LlmAgent } from "../../agents/llm-agent";
import { Event } from "../../events/event";

/**
 * Twenty-second leftover (HEAVY residual complement after open #265
 * part.text tip): Assert number `1` / `{}` keep via `||` then ToString on
 * join; `NaN` coalesces away via `|| ""`.
 */
describe("LlmAgent part.text number-one/empty-object/NaN twenty-second leftover", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	function save(agent: LlmAgent, parts: any[]): Event {
		const event = new Event({
			author: agent.name,
			content: { parts },
		});
		vi.spyOn(event, "isFinalResponse").mockReturnValue(true);
		agent["maybeSaveOutputToState"](event);
		return event;
	}

	it('number 1 part.text is kept via || and joins as "1x"', () => {
		const agent = new LlmAgent({ name: "save_one_text", outputKey: "out" });
		const event = save(agent, [{ text: 1 as any }, { text: "x" }]);
		expect(event.actions.stateDelta?.out).toBe("1x");
	});

	it('empty-object part.text joins as "[object Object]x"', () => {
		const agent = new LlmAgent({ name: "save_obj_text", outputKey: "out" });
		const event = save(agent, [{ text: {} as any }, { text: "x" }]);
		expect(event.actions.stateDelta?.out).toBe("[object Object]x");
	});

	it("NaN part.text coalesces away via ||", () => {
		const agent = new LlmAgent({ name: "save_nan_text", outputKey: "out" });
		const event = save(agent, [{ text: Number.NaN as any }, { text: "kept" }]);
		expect(event.actions.stateDelta?.out).toBe("kept");
	});
});
