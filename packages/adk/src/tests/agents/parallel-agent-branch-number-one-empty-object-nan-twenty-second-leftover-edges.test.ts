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
	invocationId: "twenty-second-par-comp",
	agent: {} as any,
	branch: "",
	session: {
		id: "ses-par-22c",
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
 * Twenty-second leftover (HEAVY residual complement after open #265):
 * twenty-first pins true/`"true"`/`-0`/`[]`; #265 pins ±Infinity. Assert
 * number `1` nests as `1.par.leaf`; `{}` nests as `[object Object].par.leaf`;
 * `NaN` resets to `par.leaf`.
 */
describe("ParallelAgent branch number-one/empty-object/NaN twenty-second leftover", () => {
	it("parent branch number 1 nests as 1.par.leaf", () => {
		const parent = new ParallelAgent({
			name: "par",
			description: "d",
		});
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

	it("parent branch empty-object nests as [object Object].par.leaf", () => {
		const parent = new ParallelAgent({
			name: "par",
			description: "d",
		});
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

	it("NaN parent branch is falsy and resets to par.leaf", () => {
		const parent = new ParallelAgent({
			name: "par",
			description: "d",
		});
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
