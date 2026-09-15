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
	invocationId: "twenty-first-par-str-neginf-inv",
	agent: {} as any,
	branch: "",
	session: {
		id: "ses-par-21n",
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
 * Twenty-first leftover residual deepen (complements #292 string-inf/obj-one/obj-false):
 * truthy branch nest — string `"-Infinity"` → `-Infinity.par.leaf`; `Object(0)`
 * → `0.par.leaf`; `Object(NaN)` → `NaN.par.leaf`.
 */
describe("ParallelAgent branch string-neginfinity/object-zero/object-nan twenty-first residual deepen", () => {
	it('string "-Infinity" parent branch nests as -Infinity.par.leaf', () => {
		const parent = new ParallelAgent({ name: "par", description: "d" });
		const child = new MockSubAgent("leaf");
		const ctx = {
			...baseContext,
			branch: "-Infinity" as any,
			agent: parent,
		} as InvocationContext;
		expect(createBranchContextForSubAgent(parent, child, ctx).branch).toBe(
			"-Infinity.par.leaf",
		);
	});

	it("Object(0) parent branch nests as 0.par.leaf", () => {
		const parent = new ParallelAgent({ name: "par", description: "d" });
		const child = new MockSubAgent("leaf");
		const ctx = {
			...baseContext,
			branch: Object(0) as any,
			agent: parent,
		} as InvocationContext;
		expect(createBranchContextForSubAgent(parent, child, ctx).branch).toBe(
			"0.par.leaf",
		);
	});

	it("Object(NaN) parent branch nests as NaN.par.leaf", () => {
		const parent = new ParallelAgent({ name: "par", description: "d" });
		const child = new MockSubAgent("leaf");
		const ctx = {
			...baseContext,
			branch: Object(Number.NaN) as any,
			agent: parent,
		} as InvocationContext;
		expect(createBranchContextForSubAgent(parent, child, ctx).branch).toBe(
			"NaN.par.leaf",
		);
	});
});
