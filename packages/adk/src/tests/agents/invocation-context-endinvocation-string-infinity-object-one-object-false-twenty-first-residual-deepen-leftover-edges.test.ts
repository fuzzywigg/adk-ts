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
 * Twenty-first leftover residual deepen (complements #284 posinf/nan/object-true):
 * `invocationId || regen` / `endInvocation || false` — string `"Infinity"` /
 * `Object(1)` / `Object(false)` keep; child copy re-applies `||`.
 */
describe("InvocationContext endInvocation/id string-infinity/object-one/object-false twenty-first residual deepen", () => {
	it.each([
		{ label: 'string "Infinity"', value: "Infinity" },
		{ label: "Object(1)", value: Object(1) },
		{ label: "Object(false)", value: Object(false) },
	])("invocationId $label is preserved (no e- regen)", ({ value }) => {
		expect(makeInvocation({ invocationId: value as any }).invocationId).toBe(
			value as any,
		);
	});

	it.each([
		{ label: 'string "Infinity"', value: "Infinity" },
		{ label: "Object(1)", value: Object(1) },
		{ label: "Object(false)", value: Object(false) },
	])("endInvocation $label is preserved via || false", ({ value }) => {
		expect(makeInvocation({ endInvocation: value as any }).endInvocation).toBe(
			value,
		);
	});

	it('createChildContext re-applies || so parent string "Infinity" end copies', () => {
		const parent = makeInvocation({
			invocationId: "Infinity" as any,
			endInvocation: "Infinity" as any,
		});
		const child = parent.createChildContext({ name: "child" } as BaseAgent);
		expect(child.invocationId).toBe("Infinity");
		expect(child.endInvocation).toBe("Infinity");
	});

	it("createChildContext copies parent Object(false) endInvocation (boxed truthy)", () => {
		const boxed = Object(false);
		const parent = makeInvocation({ endInvocation: boxed as any });
		const child = parent.createChildContext({ name: "child" } as BaseAgent);
		expect(child.endInvocation).toBe(boxed);
	});
});
