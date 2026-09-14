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
	invocationId: "twelfth-par-inv",
	agent: {} as any,
	branch: "",
	session: {
		id: "ses-par-12",
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
 * Twelfth leftover: createBranchContextForSubAgent uses truthy `branch ? nest`.
 * Fifth leftover pins "" / undefined / whitespace. `0` / `false` / `null` also
 * reset; string `"0"` nests.
 */
describe("ParallelAgent branch 0/false reset twelfth leftover", () => {
	it.each([
		{ label: "0", branch: 0 },
		{ label: "false", branch: false },
		{ label: "null", branch: null },
	])("parent branch $label resets to parent.child", ({ branch }) => {
		const parent = new ParallelAgent({
			name: "par",
			description: "d",
		});
		const child = new MockSubAgent("leaf");
		const ctx = {
			...baseContext,
			branch: branch as any,
			agent: parent,
		} as InvocationContext;
		const branched = createBranchContextForSubAgent(parent, child, ctx);
		expect(branched.branch).toBe("par.leaf");
	});

	it('string "0" is truthy and nests as 0.par.leaf', () => {
		const parent = new ParallelAgent({
			name: "par",
			description: "d",
		});
		const child = new MockSubAgent("leaf");
		const ctx = {
			...baseContext,
			branch: "0",
			agent: parent,
		} as InvocationContext;
		const branched = createBranchContextForSubAgent(parent, child, ctx);
		expect(branched.branch).toBe("0.par.leaf");
	});

	it("whitespace still nests (fifth control)", () => {
		const parent = new ParallelAgent({
			name: "par",
			description: "d",
		});
		const child = new MockSubAgent("leaf");
		const ctx = {
			...baseContext,
			branch: " ",
			agent: parent,
		} as InvocationContext;
		expect(createBranchContextForSubAgent(parent, child, ctx).branch).toBe(
			" .par.leaf",
		);
	});
});
