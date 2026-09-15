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
 * Twenty-second leftover (HEAVY residual complement after open #265 /
 * twentieth subAgents tip): Assert number `1` / `{}` pass `|| []` then throw
 * (not iterable); `NaN` coalesces to `[]` without throw.
 */
describe("BaseAgent subAgents number-one/empty-object/NaN twenty-second leftover", () => {
	it("subAgents number 1 passes || then throws (not iterable)", () => {
		expect(
			() =>
				new TestAgent({
					name: "subs_one",
					subAgents: 1 as any,
				}),
		).toThrow(/is not iterable|not a function|TypeError/i);
	});

	it("subAgents empty-object passes || then throws (not iterable)", () => {
		expect(
			() =>
				new TestAgent({
					name: "subs_obj",
					subAgents: {} as any,
				}),
		).toThrow(/is not iterable|not a function|TypeError/i);
	});

	it("NaN subAgents coalesces to [] without throw", () => {
		const agent = new TestAgent({
			name: "subs_nan",
			subAgents: Number.NaN as any,
		});
		expect(agent.subAgents).toEqual([]);
	});
});
