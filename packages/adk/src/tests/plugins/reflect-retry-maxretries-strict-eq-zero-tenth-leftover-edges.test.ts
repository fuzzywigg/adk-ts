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
 * Tenth leftover: `_handleToolError` uses `maxRetries === 0` (strict) —
 * numeric 0 takes the exceed/throw shortcut; string "0" does not.
 */
describe("reflect-retry maxRetries strict === 0 tenth leftover edges", () => {
	it("numeric 0 with throwExceptionIfRetryExceeded rethrows immediately", async () => {
		const plugin = new ReflectAndRetryToolPlugin({
			maxRetries: 0,
			throwExceptionIfRetryExceeded: true,
		});
		const error = new Error("boom");
		await expect(
			plugin.onToolErrorCallback({
				tool: makeTool(),
				toolArgs: {},
				toolContext: makeToolContext(),
				error,
			}),
		).rejects.toBe(error);
	});

	it('string "0" skips === 0 but 1 <= "0" still exceeds and throws', async () => {
		const plugin = new ReflectAndRetryToolPlugin({
			maxRetries: "0" as any,
			throwExceptionIfRetryExceeded: true,
		});
		const error = new Error("boom");
		await expect(
			plugin.onToolErrorCallback({
				tool: makeTool(),
				toolArgs: {},
				toolContext: makeToolContext(),
				error,
			}),
		).rejects.toBe(error);
	});

	it('string "0" without throw returns exceed msg with retry_count "0"', async () => {
		const plugin = new ReflectAndRetryToolPlugin({
			maxRetries: "0" as any,
			throwExceptionIfRetryExceeded: false,
		});
		const result = await plugin.onToolErrorCallback({
			tool: makeTool(),
			toolArgs: {},
			toolContext: makeToolContext(),
			error: new Error("boom"),
		});
		expect(result?.response_type).toBe(REFLECT_AND_RETRY_RESPONSE_TYPE);
		expect(result?.retry_count).toBe("0");
	});

	it("numeric 0 without throw returns the exceed message (retry_count 0)", async () => {
		const plugin = new ReflectAndRetryToolPlugin({
			maxRetries: 0,
			throwExceptionIfRetryExceeded: false,
		});
		const result = await plugin.onToolErrorCallback({
			tool: makeTool(),
			toolArgs: {},
			toolContext: makeToolContext(),
			error: new Error("boom"),
		});
		expect(result?.response_type).toBe(REFLECT_AND_RETRY_RESPONSE_TYPE);
		expect(result?.retry_count).toBe(0);
	});
});
