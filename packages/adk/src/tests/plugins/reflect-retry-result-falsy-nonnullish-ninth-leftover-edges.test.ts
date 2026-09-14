import { describe, expect, it } from "vitest";
import type { InvocationContext } from "../../agents/invocation-context";
import {
	REFLECT_AND_RETRY_RESPONSE_TYPE,
	ReflectAndRetryToolPlugin,
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

/**
 * Leftover: afterToolCallback short-circuit is result?.response_type === …
 * Falsy non-nullish results (0/false/"") skip the short-circuit and still reset
 * failure counters on the success path.
 */
describe("reflect-retry result falsy nonnullish ninth leftover edges", () => {
	it.each([
		0,
		false,
		"",
	] as const)("result: %j does not short-circuit and resets failure counters", async (result) => {
		const plugin = new ReflectAndRetryToolPlugin({ maxRetries: 2 });
		const tool = makeTool();
		const toolContext = makeToolContext();

		const first = await plugin.onToolErrorCallback({
			tool,
			toolArgs: {},
			toolContext,
			error: new Error("boom"),
		});
		expect(first?.retry_count).toBe(1);

		const after = await plugin.afterToolCallback({
			tool,
			toolArgs: {},
			toolContext,
			result,
		});
		expect(after).toBeUndefined();

		const afterReset = await plugin.onToolErrorCallback({
			tool,
			toolArgs: {},
			toolContext,
			error: new Error("again"),
		});
		expect(afterReset?.retry_count).toBe(1);
	});

	it("exact reflect response_type still short-circuits without reset (control)", async () => {
		const plugin = new ReflectAndRetryToolPlugin({ maxRetries: 2 });
		const tool = makeTool();
		const toolContext = makeToolContext();

		await plugin.onToolErrorCallback({
			tool,
			toolArgs: {},
			toolContext,
			error: new Error("boom"),
		});

		await plugin.afterToolCallback({
			tool,
			toolArgs: {},
			toolContext,
			result: {
				response_type: REFLECT_AND_RETRY_RESPONSE_TYPE,
				error_type: "X",
			},
		});

		const next = await plugin.onToolErrorCallback({
			tool,
			toolArgs: {},
			toolContext,
			error: new Error("again"),
		});
		expect(next?.retry_count).toBe(2);
	});
});
