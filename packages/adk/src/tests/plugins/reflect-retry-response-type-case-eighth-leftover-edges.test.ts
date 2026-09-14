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
 * Leftover: afterToolCallback short-circuit uses exact === on response_type —
 * wrong case does not early-return and can re-enter error handling.
 */
describe("reflect-retry response_type case eighth leftover edges", () => {
	it("exact REFLECT_AND_RETRY_RESPONSE_TYPE short-circuits afterToolCallback", async () => {
		const plugin = new ReflectAndRetryToolPlugin({
			maxRetries: 0,
			throwExceptionIfRetryExceeded: false,
		});
		const result = await plugin.afterToolCallback({
			tool: makeTool(),
			toolArgs: {},
			toolContext: makeToolContext(),
			result: {
				response_type: REFLECT_AND_RETRY_RESPONSE_TYPE,
				error_type: "X",
			},
		});
		expect(result).toBeUndefined();
	});

	it.each([
		"error_handled_by_reflect_and_retry_plugin",
		"ERROR_HANDLED_BY_REFLECT_AND_RETRY_PLUGIN ",
		"Error_Handled_By_Reflect_And_Retry_Plugin",
	] as const)("wrong-case/near-miss response_type %j does not short-circuit", async (responseType) => {
		const plugin = new ReflectAndRetryToolPlugin({
			maxRetries: 3,
			throwExceptionIfRetryExceeded: false,
		});
		plugin.extractErrorFromResult = async () =>
			new Error("still-handled") as any;

		const result = await plugin.afterToolCallback({
			tool: makeTool(),
			toolArgs: {},
			toolContext: makeToolContext(),
			result: { response_type: responseType },
		});
		expect(result?.response_type).toBe(REFLECT_AND_RETRY_RESPONSE_TYPE);
		expect(result?.error_details).toContain("still-handled");
	});
});
