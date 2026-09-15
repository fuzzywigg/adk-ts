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
	invocationId: "twenty-first-par-residual-inv",
	agent: {} as any,
	branch: "",
	session: {
		id: "ses-par-21r",
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
 * Twenty-first leftover residual deepen (complements #251 true/negzero branch):
 * truthy branch nest — POSITIVE_INFINITY → `Infinity.par.leaf`; `1` /
 * `Object(true)` nest; `{}` → `[object Object].par.leaf`; `NaN` resets.
 */
describe("ParallelAgent branch posinf/nan/object-true twenty-first residual deepen", () => {
	it("POSITIVE_INFINITY parent branch nests as Infinity.par.leaf", () => {
		const parent = new ParallelAgent({ name: "par", description: "d" });
		const child = new MockSubAgent("leaf");
		const ctx = {
			...baseContext,
			branch: Number.POSITIVE_INFINITY as any,
			agent: parent,
		} as InvocationContext;
		expect(createBranchContextForSubAgent(parent, child, ctx).branch).toBe(
			"Infinity.par.leaf",
		);
	});

	it("number 1 parent branch nests as 1.par.leaf", () => {
		const parent = new ParallelAgent({ name: "par", description: "d" });
		const child = new MockSubAgent("leaf");
		const ctx = {
			...baseContext,
			branch: 1 as any,
			agent: parent,
		} as InvocationContext;
		expect(createBranchContextForSubAgent(parent, child, ctx).branch).toBe(
			"1.par.leaf",
		);
	});

	it("Object(true) parent branch nests as true.par.leaf", () => {
		const parent = new ParallelAgent({ name: "par", description: "d" });
		const child = new MockSubAgent("leaf");
		const ctx = {
			...baseContext,
			branch: Object(true) as any,
			agent: parent,
		} as InvocationContext;
		expect(createBranchContextForSubAgent(parent, child, ctx).branch).toBe(
			"true.par.leaf",
		);
	});

	it("empty-object parent branch nests as [object Object].par.leaf", () => {
		const parent = new ParallelAgent({ name: "par", description: "d" });
		const child = new MockSubAgent("leaf");
		const ctx = {
			...baseContext,
			branch: {} as any,
			agent: parent,
		} as InvocationContext;
		expect(createBranchContextForSubAgent(parent, child, ctx).branch).toBe(
			"[object Object].par.leaf",
		);
	});

	it("NaN parent branch resets to par.leaf", () => {
		const parent = new ParallelAgent({ name: "par", description: "d" });
		const child = new MockSubAgent("leaf");
		const ctx = {
			...baseContext,
			branch: Number.NaN as any,
			agent: parent,
		} as InvocationContext;
		expect(createBranchContextForSubAgent(parent, child, ctx).branch).toBe(
			"par.leaf",
		);
	});
});
