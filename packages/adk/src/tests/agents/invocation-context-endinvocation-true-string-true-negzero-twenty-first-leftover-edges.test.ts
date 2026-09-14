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

/**
 * Twenty-first leftover: eighth pins `"0"`/`"false"` keep for id/end; fifth
 * pins boolean `true`. Assert `"true"` keeps for both; SameValueZero `-0`
 * regenerates invocationId and coalesces endInvocation to `false`. Child
 * copy re-applies `||`.
 */
describe("InvocationContext endInvocation/id true/string-true/negzero twenty-first leftover", () => {
	it('string "true" invocationId is preserved (no e- regen)', () => {
		expect(makeInvocation({ invocationId: "true" as any }).invocationId).toBe(
			"true",
		);
	});

	it("boolean true invocationId coerces via || and is preserved", () => {
		expect(makeInvocation({ invocationId: true as any }).invocationId).toBe(
			true as any,
		);
	});

	it("SameValueZero -0 invocationId regenerates (falsy || path)", () => {
		expect(
			makeInvocation({ invocationId: -0 as any }).invocationId.startsWith("e-"),
		).toBe(true);
	});

	it('string "true" endInvocation is preserved as truthy', () => {
		expect(makeInvocation({ endInvocation: "true" as any }).endInvocation).toBe(
			"true",
		);
	});

	it("boolean true endInvocation is preserved (fifth control)", () => {
		expect(makeInvocation({ endInvocation: true }).endInvocation).toBe(true);
	});

	it("SameValueZero -0 endInvocation coalesces to false", () => {
		expect(makeInvocation({ endInvocation: -0 as any }).endInvocation).toBe(
			false,
		);
	});

	it('createChildContext re-applies || so parent endInvocation "true" copies', () => {
		const parent = makeInvocation({
			invocationId: "true",
			endInvocation: "true" as any,
		});
		const child = parent.createChildContext({ name: "child" } as BaseAgent);
		expect(child.invocationId).toBe("true");
		expect(child.endInvocation).toBe("true");
	});

	it("createChildContext with parent -0 endInvocation stays false", () => {
		const parent = makeInvocation({ endInvocation: -0 as any });
		const child = parent.createChildContext({ name: "child" } as BaseAgent);
		expect(child.endInvocation).toBe(false);
	});
});
