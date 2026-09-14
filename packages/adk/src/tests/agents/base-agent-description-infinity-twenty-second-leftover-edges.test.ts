import { describe, expect, it } from "vitest";
import { BaseAgent } from "../../agents/base-agent";
import type { InvocationContext } from "../../agents/invocation-context";
import { Event } from "../../events/event";

class TestAgent extends BaseAgent {
	protected async *runAsyncImpl(
		_ctx: InvocationContext,
	): AsyncGenerator<Event, void, unknown> {
		yield new Event({
			author: this.name,
			content: { parts: [{ text: "impl" }] },
		});
	}

	protected async *runLiveImpl(
		_ctx: InvocationContext,
	): AsyncGenerator<Event, void, unknown> {
		yield new Event({
			author: this.name,
			content: { parts: [{ text: "live" }] },
		});
	}
}

/**
 * Twenty-second leftover (HEAVY tip-relaunch residual after #251):
 * twenty-first pins description true/`"true"`/`[]`/`-0`. Assert ±Infinity
 * keep via `|| ""` — residual sentinel deepen.
 */
describe("BaseAgent description infinity twenty-second leftover", () => {
	it.each([
		{ label: "POSITIVE_INFINITY", value: Number.POSITIVE_INFINITY },
		{ label: "NEGATIVE_INFINITY", value: Number.NEGATIVE_INFINITY },
	])('description $label is preserved (no || "")', ({ value }) => {
		const agent = new TestAgent({
			name: "desc_inf",
			description: value as any,
		});
		expect(agent.description).toBe(value);
	});

	it("SameValueZero -0 still coalesces to empty string (twenty-first control)", () => {
		const agent = new TestAgent({
			name: "desc_neg0",
			description: -0 as any,
		});
		expect(agent.description).toBe("");
	});
});
