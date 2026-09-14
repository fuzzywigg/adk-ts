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
 * Twentieth leftover: eighteenth pins subAgents `"0"`/`"false"` keep-then-throw.
 * Residual `"true"` passes `|| []` then throws on parentAgent assign to char `t`.
 */
describe("BaseAgent subAgents string-true keep twentieth leftover", () => {
	it('subAgents "true" passes || then throws on parentAgent assign', () => {
		expect(
			() =>
				new TestAgent({
					name: "subs_str_true",
					subAgents: "true" as any,
				}),
		).toThrow(/Cannot create property 'parentAgent' on string 't'/);
	});

	it('subAgents "false" still throws on first char (eighteenth control)', () => {
		expect(
			() =>
				new TestAgent({
					name: "subs_str_false",
					subAgents: "false" as any,
				}),
		).toThrow(/Cannot create property 'parentAgent' on string 'f'/);
	});

	it("numeric 0 still coalesces to [] without throw (sixth control)", () => {
		const agent = new TestAgent({
			name: "subs_num",
			subAgents: 0 as any,
		});
		expect(agent.subAgents).toEqual([]);
	});
});
