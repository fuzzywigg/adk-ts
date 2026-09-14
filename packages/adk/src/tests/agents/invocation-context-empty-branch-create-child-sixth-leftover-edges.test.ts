import { describe, expect, it } from "vitest";
import { BaseAgent } from "../../agents/base-agent";
import { InvocationContext } from "../../agents/invocation-context";
import { PluginManager } from "../../plugins/plugin-manager";
import type { BaseSessionService } from "../../sessions/base-session-service";
import type { Session } from "../../sessions/session";

function makeAgent(name: string): BaseAgent {
	return { name } as BaseAgent;
}

function makeInvocation(
	overrides: Partial<ConstructorParameters<typeof InvocationContext>[0]> = {},
): InvocationContext {
	return new InvocationContext({
		sessionService: {} as BaseSessionService,
		pluginManager: new PluginManager(),
		agent: makeAgent("root"),
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
 * Sixth leftover: createChildContext uses truthy branch (`this.branch ? ...`).
 * Prior leftovers cover undefined; empty-string / other falsy arms reset to agent.name.
 */
describe("InvocationContext empty-branch createChild sixth leftover", () => {
	it.each([
		{ label: "empty string", branch: "" },
		{ label: "null", branch: null },
		{ label: "0", branch: 0 },
		{ label: "false", branch: false },
	])("$label parent branch resets child to agent.name", ({ branch }) => {
		const parent = makeInvocation({ branch: branch as any });
		const child = parent.createChildContext(makeAgent("leaf"));
		expect(child.branch).toBe("leaf");
		expect(child.branch).not.toContain(".");
	});

	it("whitespace-only parent branch is truthy and nests", () => {
		const parent = makeInvocation({ branch: "   " });
		const child = parent.createChildContext(makeAgent("leaf"));
		expect(child.branch).toBe("   .leaf");
	});

	it("non-empty parent branch nests with dot", () => {
		const parent = makeInvocation({ branch: "root" });
		const child = parent.createChildContext(makeAgent("leaf"));
		expect(child.branch).toBe("root.leaf");
	});
});
