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
		invocationId: "cb-21-str-inf",
	});
}

/**
 * Twenty-first leftover residual deepen (complements #284 posinf/nan/object-true):
 * `eventActions || new EventActions()` — string `"Infinity"` / `Object(1)` /
 * `Object(false)` keep (no fresh EventActions).
 */
describe("CallbackContext eventActions string-infinity/object-one/object-false twenty-first residual deepen", () => {
	it.each([
		{ label: 'string "Infinity"', value: "Infinity" },
		{ label: "Object(1)", value: Object(1) },
		{ label: "Object(false)", value: Object(false) },
	])("$label eventActions is preserved (no fresh EventActions)", ({
		value,
	}) => {
		const ctx = new CallbackContext(makeInvocation(), {
			eventActions: value as any,
		});
		expect(ctx.eventActions).toBe(value);
		expect(ctx.eventActions).not.toBeInstanceOf(EventActions);
	});
});
