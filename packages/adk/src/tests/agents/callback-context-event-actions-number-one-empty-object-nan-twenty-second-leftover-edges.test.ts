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
		invocationId: "cb-22c",
	});
}

/**
 * Twenty-second leftover (HEAVY residual complement after open #265):
 * twenty-first pins true/`"true"`/`-0`/`[]`; #265 pins ±Infinity. Assert
 * number `1` / `{}` keep (no fresh EventActions); `NaN` mints fresh.
 */
describe("CallbackContext eventActions number-one/empty-object/NaN twenty-second leftover", () => {
	it.each([
		{ label: "number 1", value: 1 },
		{ label: "empty-object", value: {} },
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
