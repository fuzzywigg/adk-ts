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
	invocationId: "twenty-second-loop-esc-comp",
	agent: {} as any,
	branch: "",
	session: {
		id: "ses-loop-22c",
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
 * Twenty-second leftover (HEAVY residual complement after open #265):
 * twenty-first pins true/`"true"`/`-0`/`[]`; #265 pins ±Infinity. Assert
 * number `1` / `{}` stop via `if (escalate)`; `NaN` continues under
 * maxIterations.
 */
describe("LoopAgent escalate number-one/empty-object/NaN twenty-second leftover", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it.each([
		{ label: "number 1", value: 1 },
		{ label: "empty-object", value: {} },
	])("stops when escalate is $label", async ({ value }) => {
		const sub = new MockSubAgent("one_esc");
		let calls = 0;
		sub.runAsync.mockImplementation(async function* () {
			calls++;
			yield new Event({
				author: "one_esc",
				actions: {
					escalate: value as any,
					stateDelta: {},
					artifactDelta: {},
				},
			});
		});
		const agent = new LoopAgent({
			name: "one_esc_loop",
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

	it("NaN escalate is falsy and continues under maxIterations", async () => {
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
