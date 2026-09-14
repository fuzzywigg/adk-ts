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
 * Twenty-first leftover: seventh pins description `"0"`/`"false"` keep.
 * Assert boolean `true` / `"true"` keep via `|| ""`; SameValueZero `-0`
 * collapses to `""` — residual true asymmetry after twentieth tip.
 */
describe("BaseAgent description true/string-true/negzero twenty-first leftover", () => {
	it.each([
		{ label: "boolean true", value: true },
		{ label: '"true"', value: "true" },
	])('description $label is preserved (no || "")', ({ value }) => {
		const agent = new TestAgent({
			name: "desc_true",
			description: value as any,
		});
		expect(agent.description).toBe(value);
	});

	it("SameValueZero -0 description coalesces to empty string", () => {
		const agent = new TestAgent({
			name: "desc_neg0",
			description: -0 as any,
		});
		expect(agent.description).toBe("");
	});

	it("empty-array description is truthy and preserved", () => {
		const empty: never[] = [];
		const agent = new TestAgent({
			name: "desc_arr",
			description: empty as any,
		});
		expect(agent.description).toBe(empty as any);
	});

	it('string "false" still preserved (seventh control asymmetry)', () => {
		const agent = new TestAgent({
			name: "desc_false",
			description: "false" as any,
		});
		expect(agent.description).toBe("false");
	});
});
