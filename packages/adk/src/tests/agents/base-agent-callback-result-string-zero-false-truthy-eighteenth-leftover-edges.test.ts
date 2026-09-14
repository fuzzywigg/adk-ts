import { beforeEach, describe, expect, it, vi } from "vitest";
import { BaseAgent } from "../../agents/base-agent";
import type { InvocationContext } from "../../agents/invocation-context";
import { Event } from "../../events/event";

class TestAgent extends BaseAgent {
	runAsyncImplMock = vi.fn(async function* (
		_ctx: InvocationContext,
	): AsyncGenerator<Event, void, unknown> {
		yield new Event({
			author: this.name,
			content: { parts: [{ text: "impl" }] },
		});
	});

	protected async *runAsyncImpl(
		ctx: InvocationContext,
	): AsyncGenerator<Event, void, unknown> {
		yield* this.runAsyncImplMock(ctx);
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

const createMockContext = (agent: BaseAgent): InvocationContext =>
	({
		invocationId: "inv-18-cb",
		agent,
		branch: "",
		endInvocation: false,
		session: {
			id: "ses-18-cb",
			userId: "user-18",
			appName: "app-18",
			state: {},
			events: [],
			lastUpdateTime: 0,
		} as InvocationContext["session"],
		pluginManager: {
			runBeforeAgentCallback: vi.fn(async () => undefined),
			runAfterAgentCallback: vi.fn(async () => undefined),
		},
		createChildContext: vi.fn(function (this: InvocationContext, childAgent) {
			return createMockContext(childAgent);
		}),
	}) as unknown as InvocationContext;

async function collect(
	agent: TestAgent,
	overrides: Partial<InvocationContext> = {},
): Promise<{ events: Event[]; childCtx?: InvocationContext }> {
	const parent = createMockContext(agent);
	Object.assign(parent, overrides);
	let childCtx: InvocationContext | undefined;
	parent.createChildContext = vi.fn((childAgent) => {
		childCtx = createMockContext(childAgent);
		Object.assign(childCtx, overrides);
		return childCtx;
	}) as InvocationContext["createChildContext"];

	const events: Event[] = [];
	for await (const event of agent["runAsyncInternal"](parent)) {
		events.push(event);
	}
	return { events, childCtx };
}

/**
 * Eighteenth leftover: sixth leftover skips falsy callback results (`""` / `0` /
 * `false` / `null`). Assert `if (result)` treats string `"0"` / `"false"` as
 * truthy Content → stored, sets endInvocation, skips later callbacks + impl.
 */
describe("BaseAgent callback-result string-zero/false truthy eighteenth leftover", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it.each([
		{ label: '"0"', value: "0" },
		{ label: '"false"', value: "false" },
	])("before callback returning $label short-circuits as truthy content", async ({
		value,
	}) => {
		const later = vi.fn(() => ({ parts: [{ text: "never" }] }));
		const agent = new TestAgent({
			name: "before_str_truthy",
			beforeAgentCallback: [() => value as any, later],
		});
		const { events, childCtx } = await collect(agent);
		expect(later).not.toHaveBeenCalled();
		expect(agent.runAsyncImplMock).not.toHaveBeenCalled();
		expect(events).toHaveLength(1);
		expect(events[0].content).toBe(value);
		expect(childCtx?.endInvocation).toBe(true);
	});

	it("before callback returning numeric 0 still continues (sixth control)", async () => {
		const later = vi.fn(() => ({ parts: [{ text: "later-win" }] }));
		const agent = new TestAgent({
			name: "before_num_zero",
			beforeAgentCallback: [() => 0 as any, later],
		});
		const { events } = await collect(agent);
		expect(later).toHaveBeenCalledOnce();
		expect(agent.runAsyncImplMock).not.toHaveBeenCalled();
		expect(events[0].content).toEqual({ parts: [{ text: "later-win" }] });
	});
});
