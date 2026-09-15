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
 * Twenty-first leftover residual deepen (complements #251 true/negzero
 * description): `description || ""` — POSITIVE_INFINITY / `1` / `{}` /
 * `Object(true)` keep; `NaN` coalesces to `""`.
 */
describe("BaseAgent description posinf/nan/object-true twenty-first residual deepen", () => {
	it.each([
		{ label: "POSITIVE_INFINITY", value: Number.POSITIVE_INFINITY },
		{ label: "number 1", value: 1 },
		{ label: "empty object", value: {} },
		{ label: "Object(true)", value: Object(true) },
	])('description $label is preserved (no || "")', ({ value }) => {
		const agent = new TestAgent({
			name: "desc_residual",
			description: value as any,
		});
		expect(agent.description).toBe(value);
	});

	it("NaN description coalesces to empty string", () => {
		const agent = new TestAgent({
			name: "desc_nan",
			description: Number.NaN as any,
		});
		expect(agent.description).toBe("");
	});
});
