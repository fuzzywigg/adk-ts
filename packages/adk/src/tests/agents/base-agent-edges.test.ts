import { beforeEach, describe, expect, it, vi } from "vitest";
import { BaseAgent } from "../../agents/base-agent";
import type { InvocationContext } from "../../agents/invocation-context";
import { Event } from "../../events/event";

vi.mock("../../telemetry", () => ({
	telemetryService: {
		traceAsyncGenerator: vi.fn((_name: string, gen: unknown) => gen),
	},
}));

class EdgeAgent extends BaseAgent {
	runAsyncImplMock = vi.fn(async function* (
		_ctx: InvocationContext,
	): AsyncGenerator<Event, void, unknown> {
		yield new Event({ author: this.name });
	});

	runLiveImplMock = vi.fn(async function* (
		_ctx: InvocationContext,
	): AsyncGenerator<Event, void, unknown> {
		yield new Event({ author: this.name });
	});

	protected async *runAsyncImpl(
		ctx: InvocationContext,
	): AsyncGenerator<Event, void, unknown> {
		yield* this.runAsyncImplMock(ctx);
	}

	protected async *runLiveImpl(
		ctx: InvocationContext,
	): AsyncGenerator<Event, void, unknown> {
		yield* this.runLiveImplMock(ctx);
	}
}

const createMockContext = (agent: BaseAgent): InvocationContext =>
	({
		invocationId: "inv-edge",
		agent,
		branch: "",
		endInvocation: false,
		session: {
			id: "ses-edge",
			userId: "user-edge",
			appName: "app-edge",
			state: {},
			events: [],
			lastUpdateTime: 0,
		} as any,
		createChildContext: vi.fn(function (this: InvocationContext, childAgent) {
			const child = createMockContext(childAgent);
			child.pluginManager = this.pluginManager;
			return child;
		}) as any,
	}) as InvocationContext;

describe("BaseAgent leftover edges (TOKENMAXX post #124)", () => {
	let agent: EdgeAgent;
	let mockContext: InvocationContext;

	beforeEach(() => {
		agent = new EdgeAgent({ name: "edge_agent" });
		mockContext = createMockContext(agent);
		vi.clearAllMocks();
	});

	it("defaults omitted description to empty string and subAgents to []", () => {
		const bare = new EdgeAgent({ name: "bare_defaults" });
		expect(bare.description).toBe("");
		expect(bare.subAgents).toEqual([]);
	});

	it("accepts underscore-leading identifier names", () => {
		expect(() => new EdgeAgent({ name: "_leading" })).not.toThrow();
		expect(() => new EdgeAgent({ name: "_a1_b2" })).not.toThrow();
	});

	it("runLiveInternal still runs afterAgentCallback when endInvocation is set during runLiveImpl", async () => {
		const afterCb = vi.fn(() => ({
			parts: [{ text: "live-after-despite-end" }],
		}));
		agent.afterAgentCallback = afterCb;
		agent.runLiveImplMock.mockImplementation(async function* (
			ctx: InvocationContext,
		) {
			yield new Event({ author: this.name });
			ctx.endInvocation = true;
		});

		const events = [];
		for await (const event of agent["runLiveInternal"](mockContext)) {
			events.push(event);
		}

		expect(agent.runLiveImplMock).toHaveBeenCalledOnce();
		expect(afterCb).toHaveBeenCalledOnce();
		expect(events).toHaveLength(2);
		expect(events[1].content).toEqual({
			parts: [{ text: "live-after-despite-end" }],
		});
	});

	it("runAsyncInternal still skips afterAgentCallback when endInvocation is set during runAsyncImpl", async () => {
		const afterCb = vi.fn(() => ({ parts: [{ text: "should-not-run" }] }));
		agent.afterAgentCallback = afterCb;
		agent.runAsyncImplMock.mockImplementation(async function* (
			ctx: InvocationContext,
		) {
			yield new Event({ author: this.name });
			ctx.endInvocation = true;
		});

		const events = [];
		for await (const event of agent["runAsyncInternal"](mockContext)) {
			events.push(event);
		}

		expect(afterCb).not.toHaveBeenCalled();
		expect(events).toHaveLength(1);
	});

	it("plugin before override skips empty canonical before callbacks", async () => {
		mockContext.pluginManager = {
			runBeforeAgentCallback: vi.fn(async () => ({
				parts: [{ text: "plugin-wins" }],
			})),
			runAfterAgentCallback: vi.fn(async () => undefined),
		} as any;

		const events = [];
		for await (const event of agent["runAsyncInternal"](mockContext)) {
			events.push(event);
		}

		expect(agent.runAsyncImplMock).not.toHaveBeenCalled();
		expect(events[0].content).toEqual({ parts: [{ text: "plugin-wins" }] });
	});
});
