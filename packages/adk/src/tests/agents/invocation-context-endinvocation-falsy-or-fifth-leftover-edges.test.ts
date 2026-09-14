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

describe("InvocationContext endInvocation || false fifth leftover", () => {
	it.each([
		{ label: "empty-string", value: "" as const },
		{ label: "null", value: null },
		{ label: "0", value: 0 as const },
		{ label: "false", value: false as const },
		{ label: "NaN", value: Number.NaN },
	])("$label endInvocation coalesces to false via ||", ({ value }) => {
		expect(makeInvocation({ endInvocation: value as any }).endInvocation).toBe(
			false,
		);
	});

	it("truthy non-boolean endInvocation is preserved as-is", () => {
		expect(makeInvocation({ endInvocation: 1 as any }).endInvocation).toBe(1);
		expect(makeInvocation({ endInvocation: "yes" as any }).endInvocation).toBe(
			"yes",
		);
	});

	it("explicit true is preserved", () => {
		expect(makeInvocation({ endInvocation: true }).endInvocation).toBe(true);
	});
});
