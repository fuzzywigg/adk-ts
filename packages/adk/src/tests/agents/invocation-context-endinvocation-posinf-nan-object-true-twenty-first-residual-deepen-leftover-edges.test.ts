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
 * Twenty-first leftover residual deepen (complements #251 true/negzero id/end):
 * `invocationId || regen` / `endInvocation || false` — POSITIVE_INFINITY /
 * `1` / `{}` / `Object(true)` keep; `NaN` regenerates id / coalesces end.
 */
describe("InvocationContext endInvocation/id posinf/nan/object-true twenty-first residual deepen", () => {
	it.each([
		{ label: "POSITIVE_INFINITY", value: Number.POSITIVE_INFINITY },
		{ label: "number 1", value: 1 },
		{ label: "empty object", value: {} },
		{ label: "Object(true)", value: Object(true) },
	])("invocationId $label is preserved (no e- regen)", ({ value }) => {
		expect(makeInvocation({ invocationId: value as any }).invocationId).toBe(
			value as any,
		);
	});

	it("NaN invocationId regenerates (falsy || path)", () => {
		expect(
			makeInvocation({
				invocationId: Number.NaN as any,
			}).invocationId.startsWith("e-"),
		).toBe(true);
	});

	it.each([
		{ label: "POSITIVE_INFINITY", value: Number.POSITIVE_INFINITY },
		{ label: "number 1", value: 1 },
		{ label: "empty object", value: {} },
		{ label: "Object(true)", value: Object(true) },
	])("endInvocation $label is preserved via || false", ({ value }) => {
		expect(makeInvocation({ endInvocation: value as any }).endInvocation).toBe(
			value,
		);
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
		expect(child.invocationId).toBe(Number.POSITIVE_INFINITY);
		expect(child.endInvocation).toBe(Number.POSITIVE_INFINITY);
	});

	it("createChildContext with parent NaN endInvocation stays false", () => {
		const parent = makeInvocation({ endInvocation: Number.NaN as any });
		const child = parent.createChildContext({ name: "child" } as BaseAgent);
		expect(child.endInvocation).toBe(false);
	});
});
