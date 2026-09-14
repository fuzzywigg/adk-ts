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
 * Eighth leftover: string `"0"` / `"false"` are truthy for `invocationId ||`
 * and `endInvocation || false`. Fifth leftover regenerates on numeric `0` /
 * boolean `false` / `""`, and preserves `"yes"`/`1` — not these lookalike strings.
 */
describe("InvocationContext string-zero/false id+end eighth leftover", () => {
	it.each([
		{ label: '"0"', value: "0" },
		{ label: '"false"', value: "false" },
	])("$label invocationId is preserved (no e- regen)", ({ value }) => {
		expect(makeInvocation({ invocationId: value as any }).invocationId).toBe(
			value,
		);
	});

	it.each([
		{ label: '"0"', value: "0" },
		{ label: '"false"', value: "false" },
	])("$label endInvocation is preserved as truthy string", ({ value }) => {
		expect(makeInvocation({ endInvocation: value as any }).endInvocation).toBe(
			value,
		);
	});

	it("numeric 0 invocationId still regenerates (fifth control)", () => {
		expect(
			makeInvocation({ invocationId: 0 as any }).invocationId.startsWith("e-"),
		).toBe(true);
	});

	it("boolean false endInvocation still coalesces to false (fifth control)", () => {
		expect(makeInvocation({ endInvocation: false }).endInvocation).toBe(false);
	});

	it('createChildContext re-applies || so parent endInvocation "0" copies as truthy', () => {
		const parent = makeInvocation({
			invocationId: "0",
			endInvocation: "0" as any,
		});
		const child = parent.createChildContext({ name: "child" } as BaseAgent);
		expect(child.invocationId).toBe("0");
		expect(child.endInvocation).toBe("0");
	});
});
