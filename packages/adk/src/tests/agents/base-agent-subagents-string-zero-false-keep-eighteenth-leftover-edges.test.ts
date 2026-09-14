import { describe, expect, it } from "vitest";
import { BaseAgent } from "../../agents/base-agent";
import type { InvocationContext } from "../../agents/invocation-context";
import { Event } from "../../events/event";

class TestAgent extends BaseAgent {
	protected async *runAsyncImpl(
		_ctx: InvocationContext,
	): AsyncGenerator<Event, void, unknown> {
		yield new Event({ author: this.name });
	}

	protected async *runLiveImpl(
		_ctx: InvocationContext,
	): AsyncGenerator<Event, void, unknown> {
		yield new Event({ author: this.name });
	}
}

/**
 * Eighteenth leftover: sixth leftover only pins falsy `subAgents` → `[]`.
 * Truthy strings `"0"` / `"false"` pass `|| []`, then `setParentAgentForSubAgents`
 * `for…of` iterates characters and throws assigning `parentAgent` on a string.
 */
describe("BaseAgent subAgents string-zero/false keep eighteenth leftover", () => {
	it.each([
		{ label: '"0"', value: "0", char: "0" },
		{ label: '"false"', value: "false", char: "f" },
	])("subAgents $label passes || then throws on parentAgent assign", ({
		value,
		char,
	}) => {
		expect(
			() =>
				new TestAgent({
					name: "subs_str",
					subAgents: value as any,
				}),
		).toThrow(
			new RegExp(`Cannot create property 'parentAgent' on string '${char}'`),
		);
	});

	it("empty subAgents array still kept by reference (sixth control)", () => {
		const empty: BaseAgent[] = [];
		const agent = new TestAgent({ name: "subs_empty", subAgents: empty });
		expect(agent.subAgents).toBe(empty);
	});

	it("numeric 0 still coalesces to [] without throw (sixth control)", () => {
		const agent = new TestAgent({
			name: "subs_num",
			subAgents: 0 as any,
		});
		expect(agent.subAgents).toEqual([]);
	});
});
