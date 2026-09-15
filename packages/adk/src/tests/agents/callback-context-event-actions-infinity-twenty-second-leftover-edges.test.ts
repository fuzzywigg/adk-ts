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
		invocationId: "cb-22",
	});
}

/**
 * Twenty-second leftover (HEAVY tip-relaunch residual after tip #258–#261):
 * twenty-first pins eventActions true/`"true"`/`[]`/`-0`. Assert ±Infinity
 * keep (no fresh EventActions) — residual sentinel deepen.
 */
describe("CallbackContext eventActions infinity twenty-second leftover", () => {
	it.each([
		{ label: "POSITIVE_INFINITY", value: Number.POSITIVE_INFINITY },
		{ label: "NEGATIVE_INFINITY", value: Number.NEGATIVE_INFINITY },
	])("$label eventActions is preserved (no fresh EventActions)", ({
		value,
	}) => {
		const ctx = new CallbackContext(makeInvocation(), {
			eventActions: value as any,
		});
		expect(ctx.eventActions).toBe(value);
		expect(ctx.eventActions).not.toBeInstanceOf(EventActions);
	});

	it("SameValueZero -0 still mints fresh EventActions (twenty-first control)", () => {
		const ctx = new CallbackContext(makeInvocation(), {
			eventActions: -0 as any,
		});
		expect(ctx.eventActions).toBeInstanceOf(EventActions);
	});
});
