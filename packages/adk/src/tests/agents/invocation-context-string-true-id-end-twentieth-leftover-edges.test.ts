import { describe, expect, it } from "vitest";
import type { BaseAgent } from "../../agents/base-agent";
import { InvocationContext } from "../../agents/invocation-context";
import { PluginManager } from "../../plugins/plugin-manager";
import type { BaseSessionService } from "../../sessions/base-session-service";
import type { Session } from "../../sessions/session";

function makeInvocation(
	overrides: Partial<ConstructorParameters<typeof InvocationContext>[0]> = {},
): InvocationContext {
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
		...overrides,
	});
}

/**
 * Twentieth leftover: eighth pins invocationId/endInvocation `"0"`/`"false"`.
 * Residual `"true"` kept via `||` on both fields; createChild preserves
 * truthy string endInvocation.
 */
describe("InvocationContext string-true id/endInvocation twentieth leftover", () => {
	it('invocationId "true" is preserved via || (not regenerated)', () => {
		const ctx = makeInvocation({ invocationId: "true" });
		expect(ctx.invocationId).toBe("true");
	});

	it('endInvocation "true" is preserved via || false', () => {
		const ctx = makeInvocation({ endInvocation: "true" as any });
		expect(ctx.endInvocation).toBe("true");
	});

	it("createChild preserves parent endInvocation string true", () => {
		const parent = makeInvocation();
		parent.endInvocation = "true" as any;
		const child = parent.createChildContext({ name: "leaf" } as BaseAgent);
		expect(child.endInvocation).toBe("true");
		expect(child.invocationId).toBe(parent.invocationId);
	});

	it('endInvocation "false" still preserved (eighth control)', () => {
		const ctx = makeInvocation({ endInvocation: "false" as any });
		expect(ctx.endInvocation).toBe("false");
	});

	it("endInvocation boolean false still coalesces (eighth control)", () => {
		const ctx = makeInvocation({ endInvocation: false });
		expect(ctx.endInvocation).toBe(false);
	});
});
