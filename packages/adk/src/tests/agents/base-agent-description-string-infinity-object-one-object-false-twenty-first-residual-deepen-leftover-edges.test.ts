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
 * Twenty-first leftover residual deepen (complements #284 posinf/nan/object-true):
 * `description || ""` — string `"Infinity"` / `Object(1)` / `Object(false)` keep.
 */
describe("BaseAgent description string-infinity/object-one/object-false twenty-first residual deepen", () => {
	it.each([
		{ label: 'string "Infinity"', value: "Infinity" },
		{ label: "Object(1)", value: Object(1) },
		{ label: "Object(false)", value: Object(false) },
	])('description $label is preserved (no || "")', ({ value }) => {
		const agent = new TestAgent({
			name: "desc_str_inf",
			description: value as any,
		});
		expect(agent.description).toBe(value);
	});
});
