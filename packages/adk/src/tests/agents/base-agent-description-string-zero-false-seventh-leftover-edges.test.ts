import { describe, expect, it, vi } from "vitest";
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
 * Seventh leftover: `description || ""` keeps string `"0"` / `"false"`.
 * Sixth leftover only pins numeric `0` / boolean `false` / `null` coalesce.
 */
describe("BaseAgent description string-zero/false seventh leftover", () => {
	it.each([
		{ label: '"0"', value: "0" },
		{ label: '"false"', value: "false" },
	])('description $label is preserved (no || "")', ({ value }) => {
		const agent = new TestAgent({
			name: "desc_str",
			description: value as any,
		});
		expect(agent.description).toBe(value);
	});

	it("numeric 0 description still coalesces to empty (sixth control)", () => {
		const agent = new TestAgent({
			name: "desc_num",
			description: 0 as any,
		});
		expect(agent.description).toBe("");
	});

	it("boolean false description still coalesces to empty (sixth control)", () => {
		const agent = new TestAgent({
			name: "desc_bool",
			description: false as any,
		});
		expect(agent.description).toBe("");
	});

	it("empty subAgents array stays by reference while description string kept", () => {
		vi.clearAllMocks();
		const empty: BaseAgent[] = [];
		const agent = new TestAgent({
			name: "desc_subs",
			description: "0",
			subAgents: empty,
		});
		expect(agent.description).toBe("0");
		expect(agent.subAgents).toBe(empty);
	});
});
