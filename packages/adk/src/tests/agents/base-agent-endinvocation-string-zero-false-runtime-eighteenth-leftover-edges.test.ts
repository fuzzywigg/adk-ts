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
		invocationId: "inv-18-end",
		agent,
		branch: "",
		endInvocation: false,
		session: {
			id: "ses-18-end",
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
 * Eighteenth leftover: eighth leftover only preserves ctor/copy of endInvocation
 * `"0"`/`"false"`. Runtime `if (ctx.endInvocation)` in runAsyncInternal treats
 * those strings as truthy and short-circuits impl + after-callback; numeric `0`
 * / boolean `false` still run.
 */
describe("BaseAgent endInvocation string-zero/false runtime eighteenth leftover", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it.each([
		{ label: '"0"', value: "0" },
		{ label: '"false"', value: "false" },
	])("$label endInvocation skips runAsyncImpl and after-callback", async ({
		value,
	}) => {
		const agent = new TestAgent("end_str");
		const { events } = await collect(agent, {
			endInvocation: value as any,
		});
		expect(agent.runAsyncImplMock).not.toHaveBeenCalled();
		expect(agent.afterCallback).not.toHaveBeenCalled();
		expect(events).toEqual([]);
	});

	it("numeric 0 endInvocation still runs impl (eighth/fifth control)", async () => {
		const agent = new TestAgent("end_num");
		const { events } = await collect(agent, { endInvocation: 0 as any });
		expect(agent.runAsyncImplMock).toHaveBeenCalledOnce();
		expect(agent.afterCallback).toHaveBeenCalledOnce();
		expect(events.map((e) => e.content?.parts?.[0]?.text)).toEqual([
			"impl",
			"after",
		]);
	});

	it("boolean false endInvocation still runs impl (control)", async () => {
		const agent = new TestAgent("end_bool");
		const { events } = await collect(agent, { endInvocation: false });
		expect(agent.runAsyncImplMock).toHaveBeenCalledOnce();
		expect(events[0].content?.parts?.[0]?.text).toBe("impl");
	});
});
