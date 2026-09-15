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
 * Twenty-first leftover residual deepen (complements #292 string-inf/obj-one/obj-false):
 * `invocationId || regen` / `endInvocation || false` — string `"-Infinity"` /
 * `Object(0)` / `Object(NaN)` keep; child copy re-applies `||`.
 */
describe("InvocationContext endInvocation/id string-neginfinity/object-zero/object-nan twenty-first residual deepen", () => {
	it.each([
		{ label: 'string "-Infinity"', value: "-Infinity" },
		{ label: "Object(0)", value: Object(0) },
		{ label: "Object(NaN)", value: Object(Number.NaN) },
	])("invocationId $label is preserved (no e- regen)", ({ value }) => {
		expect(makeInvocation({ invocationId: value as any }).invocationId).toBe(
			value as any,
		);
	});

	it.each([
		{ label: 'string "-Infinity"', value: "-Infinity" },
		{ label: "Object(0)", value: Object(0) },
		{ label: "Object(NaN)", value: Object(Number.NaN) },
	])("endInvocation $label is preserved via || false", ({ value }) => {
		expect(makeInvocation({ endInvocation: value as any }).endInvocation).toBe(
			value,
		);
	});

	it('createChildContext re-applies || so parent string "-Infinity" end copies', () => {
		const parent = makeInvocation({
			invocationId: "-Infinity" as any,
			endInvocation: "-Infinity" as any,
		});
		const child = parent.createChildContext({ name: "child" } as BaseAgent);
		expect(child.invocationId).toBe("-Infinity");
		expect(child.endInvocation).toBe("-Infinity");
	});

	it("createChildContext copies parent Object(NaN) endInvocation (boxed truthy)", () => {
		const boxed = Object(Number.NaN);
		const parent = makeInvocation({ endInvocation: boxed as any });
		const child = parent.createChildContext({ name: "child" } as BaseAgent);
		expect(child.endInvocation).toBe(boxed);
	});
});
