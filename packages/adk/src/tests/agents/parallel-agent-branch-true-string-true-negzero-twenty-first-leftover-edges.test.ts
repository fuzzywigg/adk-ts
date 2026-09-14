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
	invocationId: "twenty-first-par-inv",
	agent: {} as any,
	branch: "",
	session: {
		id: "ses-par-21",
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
 * Twenty-first leftover: thirteenth pins branch `"false"`/`"null"` nest;
 * twelfth resets `0`/`false`/`null`. Assert `"true"` / boolean `true` nest;
 * SameValueZero `-0` resets — residual true asymmetry.
 */
describe("ParallelAgent branch true/string-true/negzero twenty-first leftover", () => {
	it('parent branch "true" nests as true.par.leaf', () => {
		const parent = new ParallelAgent({
			name: "par",
			description: "d",
		});
		const child = new MockSubAgent("leaf");
		const ctx = {
			...baseContext,
			branch: "true",
			agent: parent,
		} as InvocationContext;
		expect(createBranchContextForSubAgent(parent, child, ctx).branch).toBe(
			"true.par.leaf",
		);
	});

	it("boolean true parent branch nests as true.par.leaf (template coerce)", () => {
		const parent = new ParallelAgent({
			name: "par",
			description: "d",
		});
		const child = new MockSubAgent("leaf");
		const ctx = {
			...baseContext,
			branch: true as any,
			agent: parent,
		} as InvocationContext;
		expect(createBranchContextForSubAgent(parent, child, ctx).branch).toBe(
			"true.par.leaf",
		);
	});

	it("SameValueZero -0 parent branch resets to par.leaf", () => {
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

	it("empty-array parent branch nests as .par.leaf (array ToString)", () => {
		const parent = new ParallelAgent({
			name: "par",
			description: "d",
		});
		const child = new MockSubAgent("leaf");
		const ctx = {
			...baseContext,
			branch: [] as any,
			agent: parent,
		} as InvocationContext;
		expect(createBranchContextForSubAgent(parent, child, ctx).branch).toBe(
			".par.leaf",
		);
	});

	it('string "false" still nests (thirteenth control asymmetry)', () => {
		const parent = new ParallelAgent({
			name: "par",
			description: "d",
		});
		const child = new MockSubAgent("leaf");
		const ctx = {
			...baseContext,
			branch: "false",
			agent: parent,
		} as InvocationContext;
		expect(createBranchContextForSubAgent(parent, child, ctx).branch).toBe(
			"false.par.leaf",
		);
	});
});
