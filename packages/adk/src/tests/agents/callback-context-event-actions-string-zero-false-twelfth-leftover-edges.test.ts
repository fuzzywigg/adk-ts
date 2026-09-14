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
		invocationId: "cb-twelfth",
	});
}

/**
 * Twelfth leftover: string `"0"` / `"false"` are truthy for
 * `options.eventActions || new EventActions()` — preserved with no instanceof
 * guard. Fifth/ninth leftovers mint fresh actions on numeric `0` / boolean
 * `false` / `""` only.
 */
describe("CallbackContext eventActions string-zero/false twelfth leftover", () => {
	it.each([
		{ label: '"0"', value: "0" },
		{ label: '"false"', value: "false" },
	])("$label eventActions is preserved (no fresh EventActions)", ({
		value,
	}) => {
		const ctx = new CallbackContext(makeInvocation(), {
			eventActions: value as any,
		});
		expect(ctx.eventActions).toBe(value);
		expect(ctx.eventActions).not.toBeInstanceOf(EventActions);
	});

	it("numeric 0 eventActions still mints fresh EventActions (ninth control)", () => {
		const ctx = new CallbackContext(makeInvocation(), {
			eventActions: 0 as any,
		});
		expect(ctx.eventActions).toBeInstanceOf(EventActions);
		expect(ctx.eventActions).not.toBe(0);
	});

	it("boolean false eventActions still mints fresh EventActions (ninth control)", () => {
		const ctx = new CallbackContext(makeInvocation(), {
			eventActions: false as any,
		});
		expect(ctx.eventActions).toBeInstanceOf(EventActions);
		expect(ctx.eventActions).not.toBe(false);
	});
});
