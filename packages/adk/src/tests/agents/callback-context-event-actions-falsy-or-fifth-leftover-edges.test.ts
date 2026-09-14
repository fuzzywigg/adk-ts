import { describe, expect, it } from "vitest";
import { BaseAgent } from "../../agents/base-agent";
import { CallbackContext } from "../../agents/callback-context";
import { InvocationContext } from "../../agents/invocation-context";
import { EventActions } from "../../events/event-actions";
import { PluginManager } from "../../plugins/plugin-manager";
import type { BaseSessionService } from "../../sessions/base-session-service";
import type { Session } from "../../sessions/session";

function makeInvocation(): InvocationContext {
	return new InvocationContext({
		sessionService: {} as BaseSessionService,
		pluginManager: new PluginManager(),
		agent: { name: "root" } as BaseAgent,
		session: {
			id: "s",
			appName: "a",
			userId: "u",
			state: {},
			events: [],
		} as Session,
		invocationId: "cb-fifth",
	});
}

describe("CallbackContext eventActions || new EventActions fifth leftover", () => {
	it.each([
		{ label: "null", value: null },
		{ label: "undefined", value: undefined },
		{ label: "false", value: false },
		{ label: "0", value: 0 },
		{ label: "empty-string", value: "" },
	])("$label eventActions mints a fresh EventActions via ||", ({ value }) => {
		const ctx = new CallbackContext(makeInvocation(), {
			eventActions: value as any,
		});
		expect(ctx.eventActions).toBeInstanceOf(EventActions);
		expect(ctx.eventActions.stateDelta).toEqual({});
	});

	it("truthy EventActions instance is preserved by reference", () => {
		const actions = new EventActions({ escalate: true });
		const ctx = new CallbackContext(makeInvocation(), {
			eventActions: actions,
		});
		expect(ctx.eventActions).toBe(actions);
		expect(ctx.eventActions.escalate).toBe(true);
	});

	it("truthy non-EventActions value is preserved (no instanceof guard)", () => {
		const weird = { stateDelta: { k: 1 } } as any;
		const ctx = new CallbackContext(makeInvocation(), {
			eventActions: weird,
		});
		expect(ctx.eventActions).toBe(weird);
	});
});
