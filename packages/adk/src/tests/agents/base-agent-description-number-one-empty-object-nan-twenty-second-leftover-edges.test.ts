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
 * Twenty-second leftover (HEAVY residual complement after open #265):
 * twenty-first pins true/`"true"`/`-0`/`[]`; #265 pins ±Infinity. Assert
 * number `1` / `{}` keep via `|| ""`; `NaN` collapses to `""`.
 */
describe("BaseAgent description number-one/empty-object/NaN twenty-second leftover", () => {
	it.each([
		{ label: "number 1", value: 1 },
		{ label: "empty-object", value: {} },
	])('description $label is preserved (no || "")', ({ value }) => {
		const agent = new TestAgent({
			name: "desc_one",
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
