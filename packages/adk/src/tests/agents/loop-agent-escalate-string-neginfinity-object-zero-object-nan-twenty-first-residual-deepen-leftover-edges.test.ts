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
	invocationId: "twenty-first-loop-esc-str-neginf",
	agent: {} as any,
	branch: "",
	session: {
		id: "ses-loop-21n",
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
 * Twenty-first leftover residual deepen (complements #292 string-inf/obj-one/obj-false):
 * `if (escalate)` — string `"-Infinity"` / `Object(0)` / `Object(NaN)` stop
 * (boxed zero/NaN are truthy).
 */
describe("LoopAgent escalate string-neginfinity/object-zero/object-nan twenty-first residual deepen", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it.each([
		{ label: 'string "-Infinity"', value: "-Infinity" },
		{ label: "Object(0)", value: Object(0) },
		{ label: "Object(NaN)", value: Object(Number.NaN) },
	])("stops when escalate is $label", async ({ value }) => {
		const sub = new MockSubAgent("str_neginf_esc");
		let calls = 0;
		sub.runAsync.mockImplementation(async function* () {
			calls++;
			yield new Event({
				author: "str_neginf_esc",
				actions: {
					escalate: value as any,
					stateDelta: {},
					artifactDelta: {},
				},
			});
		});
		const agent = new LoopAgent({
			name: "str_neginf_esc_loop",
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
});
