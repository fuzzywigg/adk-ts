import { describe, expect, it } from "vitest";
import type { InvocationContext } from "../../agents/invocation-context";
import {
	REFLECT_AND_RETRY_RESPONSE_TYPE,
	ReflectAndRetryToolPlugin,
	TrackingScope,
} from "../../plugins/reflect-retry-tool-plugin";
import type { BaseTool } from "../../tools/base/base-tool";
import { ToolContext } from "../../tools/tool-context";

function makeTool(name = "flaky_tool"): BaseTool {
	return { name } as BaseTool;
}

function makeToolContext(invocationId = "inv-1"): ToolContext {
	return new ToolContext({
		invocationId,
		agent: { name: "agent" },
		session: { id: "sess", state: {} },
		appName: "app",
		userId: "user",
	} as unknown as InvocationContext);
}

describe("ReflectAndRetryToolPlugin formatArgs/reset sixth leftover (post #151)", () => {
	it("String(value) renders nested objects as [object Object] in reflection guidance", async () => {
		const plugin = new ReflectAndRetryToolPlugin({
			maxRetries: 2,
			throwExceptionIfRetryExceeded: false,
		});
		const response = await plugin.onToolErrorCallback({
			tool: makeTool("nested_args"),
			toolArgs: {
				cfg: { nested: true, depth: 2 },
				tags: ["a", "b"],
			},
			toolContext: makeToolContext(),
			error: new Error("boom"),
		});

		expect(response?.response_type).toBe(REFLECT_AND_RETRY_RESPONSE_TYPE);
		expect(response?.reflection_guidance).toContain("- cfg: [object Object]");
		expect(response?.reflection_guidance).toContain("- tags: a,b");
	});

	it("String(value) renders arrays with default join and leaves primitives as-is", async () => {
		const plugin = new ReflectAndRetryToolPlugin({
			maxRetries: 1,
			throwExceptionIfRetryExceeded: false,
		});
		const response = await plugin.onToolErrorCallback({
			tool: makeTool("prim_args"),
			toolArgs: {
				n: 0,
				ok: false,
				label: "x",
				empty: [],
			},
			toolContext: makeToolContext(),
			error: "plain",
		});

		expect(response?.reflection_guidance).toContain("- n: 0");
		expect(response?.reflection_guidance).toContain("- ok: false");
		expect(response?.reflection_guidance).toContain("- label: x");
		expect(response?.reflection_guidance).toContain("- empty: ");
	});

	it("afterToolCallback success resets when scope map was never created (no prior error)", async () => {
		const plugin = new ReflectAndRetryToolPlugin({
			maxRetries: 3,
			trackingScope: TrackingScope.INVOCATION,
		});
		const toolContext = makeToolContext("inv-fresh");
		expect((plugin as any)._scopedFailureCounters).toEqual({});

		await expect(
			plugin.afterToolCallback({
				tool: makeTool("fresh_ok"),
				toolArgs: { x: 1 },
				toolContext,
				result: { ok: true },
			}),
		).resolves.toBeUndefined();

		expect((plugin as any)._scopedFailureCounters).toEqual({});
	});

	it("afterToolCallback success deletes tool counter after a prior failure without wiping sibling tools", async () => {
		const plugin = new ReflectAndRetryToolPlugin({
			maxRetries: 3,
			throwExceptionIfRetryExceeded: false,
			trackingScope: TrackingScope.INVOCATION,
		});
		const toolContext = makeToolContext("inv-reset");
		const a = makeTool("tool_a");
		const b = makeTool("tool_b");

		await plugin.onToolErrorCallback({
			tool: a,
			toolArgs: {},
			toolContext,
			error: new Error("a-fail"),
		});
		await plugin.onToolErrorCallback({
			tool: b,
			toolArgs: {},
			toolContext,
			error: new Error("b-fail"),
		});

		expect((plugin as any)._scopedFailureCounters["inv-reset"]).toEqual({
			tool_a: 1,
			tool_b: 1,
		});

		await plugin.afterToolCallback({
			tool: a,
			toolArgs: {},
			toolContext,
			result: { ok: true },
		});

		expect((plugin as any)._scopedFailureCounters["inv-reset"]).toEqual({
			tool_b: 1,
		});
	});

	it("GLOBAL scope reset no-ops when counter map missing for the tool", async () => {
		const plugin = new ReflectAndRetryToolPlugin({
			maxRetries: 2,
			trackingScope: TrackingScope.GLOBAL,
		});
		await expect(
			plugin.afterToolCallback({
				tool: makeTool("global_ok"),
				toolArgs: {},
				toolContext: makeToolContext("ignored"),
				result: { value: 1 },
			}),
		).resolves.toBeUndefined();
		expect((plugin as any)._scopedFailureCounters).toEqual({});
	});
});
