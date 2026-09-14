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
	invocationId: "thirteenth-par-inv",
	agent: {} as any,
	branch: "",
	session: {
		id: "ses-par-13",
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
 * Thirteenth leftover: createBranchContextForSubAgent nests truthy string
 * branches `"false"` / `"null"`. Twelfth leftover reset boolean `false` /
 * `null` / `0` and nested string `"0"` — not these lookalike strings.
 */
describe("ParallelAgent branch string-false/null nest thirteenth leftover", () => {
	it.each([
		{ label: '"false"', branch: "false", expected: "false.par.leaf" },
		{ label: '"null"', branch: "null", expected: "null.par.leaf" },
	])("parent branch $label nests as $expected", ({ branch, expected }) => {
		const parent = new ParallelAgent({
			name: "par",
			description: "d",
		});
		const child = new MockSubAgent("leaf");
		const ctx = {
			...baseContext,
			branch,
			agent: parent,
		} as InvocationContext;
		const branched = createBranchContextForSubAgent(parent, child, ctx);
		expect(branched.branch).toBe(expected);
	});

	it("boolean false still resets to par.leaf (twelfth control)", () => {
		const parent = new ParallelAgent({
			name: "par",
			description: "d",
		});
		const child = new MockSubAgent("leaf");
		const ctx = {
			...baseContext,
			branch: false as any,
			agent: parent,
		} as InvocationContext;
		expect(createBranchContextForSubAgent(parent, child, ctx).branch).toBe(
			"par.leaf",
		);
	});

	it("null still resets to par.leaf (twelfth control)", () => {
		const parent = new ParallelAgent({
			name: "par",
			description: "d",
		});
		const child = new MockSubAgent("leaf");
		const ctx = {
			...baseContext,
			branch: null as any,
			agent: parent,
		} as InvocationContext;
		expect(createBranchContextForSubAgent(parent, child, ctx).branch).toBe(
			"par.leaf",
		);
	});

	it('string "0" still nests (twelfth control)', () => {
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
		expect(createBranchContextForSubAgent(parent, child, ctx).branch).toBe(
			"0.par.leaf",
		);
	});
});
