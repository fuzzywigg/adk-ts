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
 * Twentieth leftover: seventh pins description `"0"`/`"false"`. Residual
 * `"true"` kept via `description || ""`; boolean `true` also kept.
 */
describe("BaseAgent description string-true twentieth leftover", () => {
	it('description "true" is preserved (no || "")', () => {
		const agent = new TestAgent({
			name: "desc_str_true",
			description: "true" as any,
		});
		expect(agent.description).toBe("true");
	});

	it("description boolean true is preserved (truthy non-string)", () => {
		const agent = new TestAgent({
			name: "desc_bool_true",
			description: true as any,
		});
		expect(agent.description).toBe(true);
	});

	it("boolean false description still coalesces to empty (seventh control)", () => {
		const agent = new TestAgent({
			name: "desc_bool_false",
			description: false as any,
		});
		expect(agent.description).toBe("");
	});
});
