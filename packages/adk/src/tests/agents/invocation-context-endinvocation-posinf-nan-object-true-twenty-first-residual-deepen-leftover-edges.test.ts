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
 * Twenty-first leftover residual deepen (complements #251 true/negzero):
 * invocationId / endInvocation `||` — POSITIVE_INFINITY / `1` / `{}` /
 * `Object(true)` / `"Infinity"` kept; `NaN` regenerates id / coalesces end.
 * Child copy re-applies `||`.
 */
describe("InvocationContext endInvocation/id posinf/nan/object-true twenty-first residual deepen", () => {
	it.each([
		{ label: "POSITIVE_INFINITY", value: Number.POSITIVE_INFINITY },
		{ label: "number 1", value: 1 },
		{ label: "empty object", value: {} },
		{ label: "Object(true)", value: Object(true) },
		{ label: '"Infinity"', value: "Infinity" },
		{ label: "NEGATIVE_INFINITY", value: Number.NEGATIVE_INFINITY },
	])("$label invocationId/endInvocation are preserved", ({ value }) => {
		const ctx = makeInvocation({
			invocationId: value as any,
			endInvocation: value as any,
		});
		expect(ctx.invocationId).toBe(value as any);
		expect(ctx.endInvocation).toBe(value);
	});

	it("NaN invocationId regenerates (falsy || path)", () => {
		expect(
			makeInvocation({
				invocationId: Number.NaN as any,
			}).invocationId.startsWith("e-"),
		).toBe(true);
	});

	it("NaN endInvocation coalesces to false", () => {
		expect(
			makeInvocation({ endInvocation: Number.NaN as any }).endInvocation,
		).toBe(false);
	});

	it("createChildContext re-applies || so parent POSITIVE_INFINITY end copies", () => {
		const parent = makeInvocation({
			invocationId: Number.POSITIVE_INFINITY as any,
			endInvocation: Number.POSITIVE_INFINITY as any,
		});
		const child = parent.createChildContext({ name: "child" } as BaseAgent);
		expect(child.invocationId).toBe(Number.POSITIVE_INFINITY as any);
		expect(child.endInvocation).toBe(Number.POSITIVE_INFINITY);
	});

	it("createChildContext with parent NaN endInvocation stays false", () => {
		const parent = makeInvocation({ endInvocation: Number.NaN as any });
		const child = parent.createChildContext({ name: "child" } as BaseAgent);
		expect(child.endInvocation).toBe(false);
	});
});
