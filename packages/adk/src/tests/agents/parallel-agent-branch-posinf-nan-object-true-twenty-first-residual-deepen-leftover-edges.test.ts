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
	invocationId: "twenty-first-par-resid",
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
 * Twenty-first leftover residual deepen (complements #251 true/negzero):
 * parent `branch` truthiness — POSITIVE_INFINITY / `1` / `{}` / `Object(true)` /
 * `"Infinity"` nest; `NaN` resets to `par.leaf`.
 */
describe("ParallelAgent branch posinf/nan/object-true twenty-first residual deepen", () => {
	it.each([
		{
			label: "POSITIVE_INFINITY",
			value: Number.POSITIVE_INFINITY,
			expected: "Infinity.par.leaf",
		},
		{ label: "number 1", value: 1, expected: "1.par.leaf" },
		{
			label: "empty object",
			value: {},
			expected: "[object Object].par.leaf",
		},
		{
			label: "Object(true)",
			value: Object(true),
			expected: "true.par.leaf",
		},
		{ label: '"Infinity"', value: "Infinity", expected: "Infinity.par.leaf" },
		{
			label: "NEGATIVE_INFINITY",
			value: Number.NEGATIVE_INFINITY,
			expected: "-Infinity.par.leaf",
		},
	])("parent branch $label nests as $expected", ({ value, expected }) => {
		const parent = new ParallelAgent({
			name: "par",
			description: "d",
		});
		const child = new MockSubAgent("leaf");
		const ctx = {
			...baseContext,
			branch: value as any,
			agent: parent,
		} as InvocationContext;
		expect(createBranchContextForSubAgent(parent, child, ctx).branch).toBe(
			expected,
		);
	});

	it("NaN parent branch resets to par.leaf", () => {
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
