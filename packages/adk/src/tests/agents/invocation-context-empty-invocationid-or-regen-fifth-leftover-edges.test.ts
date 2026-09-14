import { describe, expect, it } from "vitest";
import { BaseAgent } from "../../agents/base-agent";
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

describe("InvocationContext invocationId || regen fifth leftover", () => {
	it("empty-string invocationId regenerates via || (unlike Event ??)", () => {
		const ctx = makeInvocation({ invocationId: "" });
		expect(ctx.invocationId).not.toBe("");
		expect(ctx.invocationId.startsWith("e-")).toBe(true);
	});

	it.each([
		{ label: "null", value: null },
		{ label: "false", value: false },
		{ label: "0", value: 0 },
	])("$label invocationId regenerates via ||", ({ value }) => {
		const ctx = makeInvocation({ invocationId: value as any });
		expect(ctx.invocationId.startsWith("e-")).toBe(true);
	});

	it("whitespace-only invocationId is truthy and preserved", () => {
		expect(makeInvocation({ invocationId: "   " }).invocationId).toBe("   ");
	});

	it("omitted invocationId regenerates", () => {
		expect(makeInvocation().invocationId.startsWith("e-")).toBe(true);
	});

	it("non-empty invocationId is preserved", () => {
		expect(makeInvocation({ invocationId: "fixed" }).invocationId).toBe(
			"fixed",
		);
	});
});
