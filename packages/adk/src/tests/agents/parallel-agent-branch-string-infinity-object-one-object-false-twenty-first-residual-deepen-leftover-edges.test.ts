import { describe, expect, it, vi } from "vitest";
import { BaseAgent } from "../../agents/base-agent";
import type { InvocationContext } from "../../agents/invocation-context";
import {
	createBranchContextForSubAgent,
	ParallelAgent,
} from "../../agents/parallel-agent";
import { PluginManager } from "../../plugins/plugin-manager";
import type { BaseSessionService } from "../../sessions/base-session-service";

class MockSubAgent extends BaseAgent {
	constructor(name: string) {
		super({ name, description: "" });
	}
}

const baseContext: InvocationContext = {
	invocationId: "twenty-first-par-str-inf-inv",
	agent: {} as any,
	branch: "",
	session: {
		id: "ses-par-21s",
		userId: "user-par",
		appName: "app-par",
		state: {},
		events: [],
		lastUpdateTime: 0,
	} as any,
	endInvocation: false,
	sessionService: {} as BaseSessionService,
	pluginManager: new PluginManager(),
	createChildContext: vi.fn(),
} as unknown as InvocationContext;

/**
 * Twenty-first leftover residual deepen (complements #284 posinf/nan/object-true):
 * truthy branch nest — string `"Infinity"` → `Infinity.par.leaf`; `Object(1)`
 * → `1.par.leaf`; `Object(false)` → `false.par.leaf`.
 */
describe("ParallelAgent branch string-infinity/object-one/object-false twenty-first residual deepen", () => {
	it('string "Infinity" parent branch nests as Infinity.par.leaf', () => {
		const parent = new ParallelAgent({ name: "par", description: "d" });
		const child = new MockSubAgent("leaf");
		const ctx = {
			...baseContext,
			branch: "Infinity" as any,
			agent: parent,
		} as InvocationContext;
		expect(createBranchContextForSubAgent(parent, child, ctx).branch).toBe(
			"Infinity.par.leaf",
		);
	});

	it("Object(1) parent branch nests as 1.par.leaf", () => {
		const parent = new ParallelAgent({ name: "par", description: "d" });
		const child = new MockSubAgent("leaf");
		const ctx = {
			...baseContext,
			branch: Object(1) as any,
			agent: parent,
		} as InvocationContext;
		expect(createBranchContextForSubAgent(parent, child, ctx).branch).toBe(
			"1.par.leaf",
		);
	});

	it("Object(false) parent branch nests as false.par.leaf", () => {
		const parent = new ParallelAgent({ name: "par", description: "d" });
		const child = new MockSubAgent("leaf");
		const ctx = {
			...baseContext,
			branch: Object(false) as any,
			agent: parent,
		} as InvocationContext;
		expect(createBranchContextForSubAgent(parent, child, ctx).branch).toBe(
			"false.par.leaf",
		);
	});
});
