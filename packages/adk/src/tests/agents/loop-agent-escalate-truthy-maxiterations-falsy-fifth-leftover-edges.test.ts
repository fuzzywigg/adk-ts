import { beforeEach, describe, expect, it, vi } from "vitest";
import { BaseAgent } from "../../agents/base-agent";
import type { InvocationContext } from "../../agents/invocation-context";
import { LoopAgent } from "../../agents/loop-agent";
import { Event } from "../../events/event";
import { PluginManager } from "../../plugins/plugin-manager";
import type { BaseSessionService } from "../../sessions/base-session-service";

class MockSubAgent extends BaseAgent {
	runAsync = vi.fn();
	runLive = vi.fn();

	constructor(name: string) {
		super({ name, description: "" });
	}
}

const mockContext: InvocationContext = {
	invocationId: "fifth-loop-inv",
	agent: {} as any,
	branch: "",
	session: {
		id: "ses-loop-fifth",
		userId: "user-loop",
		appName: "app-loop",
		state: {},
		events: [],
		lastUpdateTime: 0,
	} as any,
	endInvocation: false,
	sessionService: {} as BaseSessionService,
	pluginManager: new PluginManager(),
	createChildContext: vi.fn(function (this: InvocationContext, child) {
		return {
			...this,
			agent: child,
			branch: this.branch ? `${this.branch}.${child.name}` : child.name,
		} as InvocationContext;
	}),
} as unknown as InvocationContext;

describe("LoopAgent fifth leftover — escalate truthy asymmetry", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	const truthyEscalateValues = [1, "yes", {}, []] as const;

	for (const escalate of truthyEscalateValues) {
		it(`stops when escalate is truthy non-boolean (${JSON.stringify(escalate)})`, async () => {
			const sub = new MockSubAgent("truthy_esc");
			let calls = 0;
			sub.runAsync.mockImplementation(async function* () {
				calls++;
				yield new Event({
					author: "truthy_esc",
					actions: {
						escalate: escalate as any,
						stateDelta: {},
						artifactDelta: {},
					},
				});
			});
			const agent = new LoopAgent({
				name: "truthy_loop",
				description: "d",
				subAgents: [sub],
				maxIterations: 5,
			});
			const events: Event[] = [];
			for await (const event of agent["runAsyncImpl"](mockContext)) {
				events.push(event);
			}
			expect(calls).toBe(1);
			expect(events).toHaveLength(1);
		});
	}

	const falsyEscalateValues = [0, "", null] as const;

	for (const escalate of falsyEscalateValues) {
		it(`continues when escalate is falsy (${JSON.stringify(escalate)}) under maxIterations`, async () => {
			const sub = new MockSubAgent("falsy_esc");
			sub.runAsync.mockImplementation(async function* () {
				yield new Event({
					author: "falsy_esc",
					actions: {
						escalate: escalate as any,
						stateDelta: {},
						artifactDelta: {},
					},
				});
			});
			const agent = new LoopAgent({
				name: "falsy_loop",
				description: "d",
				subAgents: [sub],
				maxIterations: 2,
			});
			const events: Event[] = [];
			for await (const event of agent["runAsyncImpl"](mockContext)) {
				events.push(event);
			}
			expect(sub.runAsync).toHaveBeenCalledTimes(2);
			expect(events).toHaveLength(2);
		});
	}

	it("missing actions object does not escalate (optional chaining)", async () => {
		const sub = new MockSubAgent("no_actions");
		sub.runAsync.mockImplementation(async function* () {
			yield new Event({ author: "no_actions" });
		});
		const agent = new LoopAgent({
			name: "no_act_loop",
			description: "d",
			subAgents: [sub],
			maxIterations: 2,
		});
		const events: Event[] = [];
		for await (const event of agent["runAsyncImpl"](mockContext)) {
			events.push(event);
		}
		expect(events).toHaveLength(2);
	});
});

describe("LoopAgent fifth leftover — maxIterations !falsy unbounded trap", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("treats maxIterations: null as unbounded via !null", async () => {
		const sub = new MockSubAgent("null_max");
		let calls = 0;
		sub.runAsync.mockImplementation(async function* () {
			calls++;
			if (calls >= 3) {
				yield new Event({
					author: "null_max",
					actions: { escalate: true, stateDelta: {}, artifactDelta: {} },
				});
				return;
			}
			yield new Event({ author: "null_max" });
		});
		const agent = new LoopAgent({
			name: "null_max_loop",
			description: "d",
			subAgents: [sub],
			maxIterations: null as any,
		});
		for await (const _ of agent["runAsyncImpl"](mockContext)) {
		}
		expect(calls).toBe(3);
	});

	it("treats maxIterations: NaN as unbounded via !NaN", async () => {
		const sub = new MockSubAgent("nan_max");
		let calls = 0;
		sub.runAsync.mockImplementation(async function* () {
			calls++;
			if (calls >= 3) {
				yield new Event({
					author: "nan_max",
					actions: { escalate: true, stateDelta: {}, artifactDelta: {} },
				});
				return;
			}
			yield new Event({ author: "nan_max" });
		});
		const agent = new LoopAgent({
			name: "nan_max_loop",
			description: "d",
			subAgents: [sub],
			maxIterations: Number.NaN,
		});
		for await (const _ of agent["runAsyncImpl"](mockContext)) {
		}
		expect(calls).toBe(3);
	});

	it("finite maxIterations: 1 still caps a non-escalating sub-agent", async () => {
		const sub = new MockSubAgent("cap_one");
		sub.runAsync.mockImplementation(async function* () {
			yield new Event({ author: "cap_one" });
		});
		const agent = new LoopAgent({
			name: "cap_one_loop",
			description: "d",
			subAgents: [sub],
			maxIterations: 1,
		});
		const events: Event[] = [];
		for await (const event of agent["runAsyncImpl"](mockContext)) {
			events.push(event);
		}
		expect(sub.runAsync).toHaveBeenCalledTimes(1);
		expect(events).toHaveLength(1);
	});
});
