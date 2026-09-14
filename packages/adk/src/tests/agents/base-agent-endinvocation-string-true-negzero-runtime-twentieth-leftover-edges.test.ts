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

	afterCallback = vi.fn(() => ({ parts: [{ text: "after" }] }));

	constructor(name: string) {
		super({ name, description: "" });
		this.afterAgentCallback = this.afterCallback;
	}

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
		invocationId: "inv-20-end",
		agent,
		branch: "",
		endInvocation: false,
		session: {
			id: "ses-20-end",
			userId: "user-20",
			appName: "app-20",
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
 * Twentieth leftover: eighteenth pins `"0"`/`"false"` truthy short-circuit.
 * String `"true"` likewise short-circuits; SameValueZero `-0` remains falsy
 * and still runs impl (asymmetry vs string-true).
 */
describe("BaseAgent endInvocation string-true/negzero runtime twentieth leftover", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('string "true" endInvocation skips runAsyncImpl and after-callback', async () => {
		const agent = new TestAgent("end_str_true");
		const { events } = await collect(agent, {
			endInvocation: "true" as any,
		});
		expect(agent.runAsyncImplMock).not.toHaveBeenCalled();
		expect(agent.afterCallback).not.toHaveBeenCalled();
		expect(events).toEqual([]);
	});

	it("boolean true endInvocation still short-circuits (control)", async () => {
		const agent = new TestAgent("end_bool_true");
		const { events } = await collect(agent, { endInvocation: true });
		expect(agent.runAsyncImplMock).not.toHaveBeenCalled();
		expect(events).toEqual([]);
	});

	it("SameValueZero -0 endInvocation still runs impl (falsy)", async () => {
		const agent = new TestAgent("end_neg0");
		const { events } = await collect(agent, { endInvocation: -0 as any });
		expect(agent.runAsyncImplMock).toHaveBeenCalledOnce();
		expect(agent.afterCallback).toHaveBeenCalledOnce();
		expect(events.map((e) => e.content?.parts?.[0]?.text)).toEqual([
			"impl",
			"after",
		]);
	});

	it('string "false" still short-circuits (eighteenth control)', async () => {
		const agent = new TestAgent("end_str_false");
		const { events } = await collect(agent, {
			endInvocation: "false" as any,
		});
		expect(agent.runAsyncImplMock).not.toHaveBeenCalled();
		expect(events).toEqual([]);
	});
});
