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
 * Twenty-first leftover residual deepen (complements #292 string-inf/obj-one/obj-false):
 * `description || ""` — string `"-Infinity"` / `Object(0)` / `Object(NaN)` keep.
 */
describe("BaseAgent description string-neginfinity/object-zero/object-nan twenty-first residual deepen", () => {
	it.each([
		{ label: 'string "-Infinity"', value: "-Infinity" },
		{ label: "Object(0)", value: Object(0) },
		{ label: "Object(NaN)", value: Object(Number.NaN) },
	])('description $label is preserved (no || "")', ({ value }) => {
		const agent = new TestAgent({
			name: "desc_str_neginf",
			description: value as any,
		});
		expect(agent.description).toBe(value);
	});
});
