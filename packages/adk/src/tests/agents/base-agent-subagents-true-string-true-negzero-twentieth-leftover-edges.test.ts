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
 * Twentieth leftover: eighteenth pins `"0"`/`"false"` pass `|| []` then throw
 * on parentAgent assign. String `"true"` likewise; boolean `true` is not
 * iterable; SameValueZero `-0` coalesces to `[]` without throw.
 */
describe("BaseAgent subAgents true/string-true/negzero twentieth leftover", () => {
	it('subAgents "true" passes || then throws on parentAgent assign', () => {
		expect(
			() =>
				new TestAgent({
					name: "subs_str_true",
					subAgents: "true" as any,
				}),
		).toThrow(/Cannot create property 'parentAgent' on string 't'/);
	});

	it("subAgents boolean true passes || then throws (not iterable)", () => {
		expect(
			() =>
				new TestAgent({
					name: "subs_bool_true",
					subAgents: true as any,
				}),
		).toThrow(/is not iterable|not a function|TypeError/i);
	});

	it("SameValueZero -0 subAgents coalesces to [] without throw", () => {
		const agent = new TestAgent({
			name: "subs_neg0",
			subAgents: -0 as any,
		});
		expect(agent.subAgents).toEqual([]);
	});

	it('subAgents "false" still throws (eighteenth control)', () => {
		expect(
			() =>
				new TestAgent({
					name: "subs_str_false",
					subAgents: "false" as any,
				}),
		).toThrow(/Cannot create property 'parentAgent' on string 'f'/);
	});
});
