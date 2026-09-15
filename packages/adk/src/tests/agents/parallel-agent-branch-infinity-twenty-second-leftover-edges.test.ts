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
	invocationId: "twenty-second-par-inv",
	agent: {} as any,
	branch: "",
	session: {
		id: "ses-par-22",
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
 * Twenty-second leftover (HEAVY tip-relaunch residual after tip #258–#261):
 * twenty-first pins branch true/`"true"`/`[]`/`-0`. Assert ±Infinity nest
 * via template coerce — residual sentinel deepen.
 */
describe("ParallelAgent branch infinity twenty-second leftover", () => {
	it("POSITIVE_INFINITY parent branch nests as Infinity.par.leaf", () => {
		const parent = new ParallelAgent({
			name: "par",
			description: "d",
		});
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

	it("NEGATIVE_INFINITY parent branch nests as -Infinity.par.leaf", () => {
		const parent = new ParallelAgent({
			name: "par",
			description: "d",
		});
		const child = new MockSubAgent("leaf");
		const ctx = {
			...baseContext,
			branch: Number.NEGATIVE_INFINITY as any,
			agent: parent,
		} as InvocationContext;
		expect(createBranchContextForSubAgent(parent, child, ctx).branch).toBe(
			"-Infinity.par.leaf",
		);
	});

	it("SameValueZero -0 still resets to par.leaf (twenty-first control)", () => {
		const parent = new ParallelAgent({
			name: "par",
			description: "d",
		});
		const child = new MockSubAgent("leaf");
		const ctx = {
			...baseContext,
			branch: -0 as any,
			agent: parent,
		} as InvocationContext;
		expect(createBranchContextForSubAgent(parent, child, ctx).branch).toBe(
			"par.leaf",
		);
	});
});
