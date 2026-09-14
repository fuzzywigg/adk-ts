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
		invocationId: "cb-21",
	});
}

/**
 * Twenty-first leftover: twelfth pins `"0"`/`"false"` keep for eventActions.
 * Assert boolean `true` / `"true"` keep (no fresh EventActions); SameValueZero
 * `-0` mints fresh — true asymmetry residual.
 */
describe("CallbackContext eventActions true/string-true/negzero twenty-first leftover", () => {
	it.each([
		{ label: "boolean true", value: true },
		{ label: '"true"', value: "true" },
	])("$label eventActions is preserved (no fresh EventActions)", ({
		value,
	}) => {
		const ctx = new CallbackContext(makeInvocation(), {
			eventActions: value as any,
		});
		expect(ctx.eventActions).toBe(value);
		expect(ctx.eventActions).not.toBeInstanceOf(EventActions);
	});

	it("SameValueZero -0 eventActions mints fresh EventActions", () => {
		const ctx = new CallbackContext(makeInvocation(), {
			eventActions: -0 as any,
		});
		expect(ctx.eventActions).toBeInstanceOf(EventActions);
		expect(ctx.eventActions).not.toBe(-0 as any);
	});

	it("empty-array eventActions is truthy and preserved", () => {
		const empty: never[] = [];
		const ctx = new CallbackContext(makeInvocation(), {
			eventActions: empty as any,
		});
		expect(ctx.eventActions).toBe(empty as any);
		expect(ctx.eventActions).not.toBeInstanceOf(EventActions);
	});

	it('string "false" still preserved (twelfth control asymmetry)', () => {
		const ctx = new CallbackContext(makeInvocation(), {
			eventActions: "false" as any,
		});
		expect(ctx.eventActions).toBe("false");
	});
});
