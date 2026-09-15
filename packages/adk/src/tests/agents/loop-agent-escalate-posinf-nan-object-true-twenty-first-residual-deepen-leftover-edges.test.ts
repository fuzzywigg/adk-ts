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
	invocationId: "twenty-first-loop-esc-residual",
	agent: {} as any,
	branch: "",
	session: {
		id: "ses-loop-21r",
		userId: "user-loop",
		appName: "app-loop",
		state: {},
		events: [],
		lastUpdateTime: 0,
	} as any,
	endInvocation: false,
	sessionService: {} as BaseSessionService,
	pluginManager: new PluginManager(),
	createChildContext: vi.fn(),
} as unknown as InvocationContext;

/**
 * Twenty-first leftover residual deepen (complements #251 true/negzero
 * escalate): `if (escalate)` — POSITIVE_INFINITY / `1` / `{}` / `Object(true)`
 * stop; `NaN` continues under maxIterations.
 */
describe("LoopAgent escalate posinf/nan/object-true twenty-first residual deepen", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it.each([
		{ label: "POSITIVE_INFINITY", value: Number.POSITIVE_INFINITY },
		{ label: "number 1", value: 1 },
		{ label: "empty object", value: {} },
		{ label: "Object(true)", value: Object(true) },
	])("stops when escalate is $label", async ({ value }) => {
		const sub = new MockSubAgent("residual_esc");
		let calls = 0;
		sub.runAsync.mockImplementation(async function* () {
			calls++;
			yield new Event({
				author: "residual_esc",
				actions: {
					escalate: value as any,
					stateDelta: {},
					artifactDelta: {},
				},
			});
		});
		const agent = new LoopAgent({
			name: "residual_esc_loop",
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

	it("NaN escalate still continues under maxIterations", async () => {
		const sub = new MockSubAgent("nan_esc");
		sub.runAsync.mockImplementation(async function* () {
			yield new Event({
				author: "nan_esc",
				actions: {
					escalate: Number.NaN as any,
					stateDelta: {},
					artifactDelta: {},
				},
			});
		});
		const agent = new LoopAgent({
			name: "nan_esc_loop",
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
});
