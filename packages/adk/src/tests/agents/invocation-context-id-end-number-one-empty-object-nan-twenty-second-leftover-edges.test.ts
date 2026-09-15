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
 * Twenty-second leftover (HEAVY residual complement after open #265 /
 * twenty-first id/end tip): Assert number `1` / `{}` keep for invocationId /
 * endInvocation; `NaN` regenerates id and coalesces endInvocation to false.
 * Child copy re-applies `||`.
 */
describe("InvocationContext id/end number-one/empty-object/NaN twenty-second leftover", () => {
	it("number 1 invocationId is preserved (no e- regen)", () => {
		expect(makeInvocation({ invocationId: 1 as any }).invocationId).toBe(
			1 as any,
		);
	});

	it("empty-object invocationId is preserved (no e- regen)", () => {
		const empty = {};
		expect(makeInvocation({ invocationId: empty as any }).invocationId).toBe(
			empty as any,
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
		{ label: "number 1", value: 1 },
		{ label: "empty-object", value: {} },
	])("endInvocation $label is preserved as truthy", ({ value }) => {
		expect(makeInvocation({ endInvocation: value as any }).endInvocation).toBe(
			value,
		);
	});

	it("NaN endInvocation coalesces to false", () => {
		expect(
			makeInvocation({ endInvocation: Number.NaN as any }).endInvocation,
		).toBe(false);
	});

	it("createChildContext re-applies || so parent endInvocation 1 copies", () => {
		const parent = makeInvocation({
			invocationId: 1 as any,
			endInvocation: 1 as any,
		});
		const child = parent.createChildContext({ name: "child" } as BaseAgent);
		expect(child.invocationId).toBe(1 as any);
		expect(child.endInvocation).toBe(1 as any);
	});

	it("createChildContext with parent NaN endInvocation stays false", () => {
		const parent = makeInvocation({ endInvocation: Number.NaN as any });
		const child = parent.createChildContext({ name: "child" } as BaseAgent);
		expect(child.endInvocation).toBe(false);
	});
});
