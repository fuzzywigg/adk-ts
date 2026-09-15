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
		invocationId: "cb-21-residual",
	});
}

/**
 * Twenty-first leftover residual deepen (complements #251 true/negzero
 * eventActions): `eventActions || new EventActions()` — POSITIVE_INFINITY /
 * `1` / `{}` / `Object(true)` keep; `NaN` mints fresh EventActions.
 */
describe("CallbackContext eventActions posinf/nan/object-true twenty-first residual deepen", () => {
	it.each([
		{ label: "POSITIVE_INFINITY", value: Number.POSITIVE_INFINITY },
		{ label: "number 1", value: 1 },
		{ label: "empty object", value: {} },
		{ label: "Object(true)", value: Object(true) },
	])("$label eventActions is preserved (no fresh EventActions)", ({
		value,
	}) => {
		const ctx = new CallbackContext(makeInvocation(), {
			eventActions: value as any,
		});
		expect(ctx.eventActions).toBe(value);
		expect(ctx.eventActions).not.toBeInstanceOf(EventActions);
	});

	it("NaN eventActions mints fresh EventActions", () => {
		const ctx = new CallbackContext(makeInvocation(), {
			eventActions: Number.NaN as any,
		});
		expect(ctx.eventActions).toBeInstanceOf(EventActions);
		expect(Number.isNaN(ctx.eventActions as any)).toBe(false);
	});
});
