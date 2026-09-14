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

describe("ReflectAndRetry formatArgs nullish + maxRetries 0 seventh leftover (post #158)", () => {
	it("String(null)/String(undefined) appear in reflection guidance args", async () => {
		const plugin = new ReflectAndRetryToolPlugin({
			maxRetries: 2,
			throwExceptionIfRetryExceeded: false,
		});
		const out = await plugin.onToolErrorCallback({
			tool: makeTool("fmt"),
			toolArgs: { a: null, b: undefined },
			toolContext: makeToolContext("inv-fmt"),
			error: new Error("boom"),
		});

		expect(out?.response_type).toBe(REFLECT_AND_RETRY_RESPONSE_TYPE);
		expect(out?.reflection_guidance).toContain("- a: null");
		expect(out?.reflection_guidance).toContain("- b: undefined");
	});

	it("maxRetries 0 + throwExceptionIfRetryExceeded throws before counters/lock", async () => {
		const plugin = new ReflectAndRetryToolPlugin({
			maxRetries: 0,
			throwExceptionIfRetryExceeded: true,
		});
		const err = new Error("hard-fail");
		await expect(
			plugin.onToolErrorCallback({
				tool: makeTool(),
				toolArgs: { x: 1 },
				toolContext: makeToolContext("inv-zero"),
				error: err,
			}),
		).rejects.toBe(err);
		expect((plugin as any)._scopedFailureCounters).toEqual({});
	});

	it("maxRetries 0 + throwExceptionIfRetryExceeded false returns exceed msg without counters", async () => {
		const plugin = new ReflectAndRetryToolPlugin({
			maxRetries: 0,
			throwExceptionIfRetryExceeded: false,
		});
		const out = await plugin.onToolErrorCallback({
			tool: makeTool("z"),
			toolArgs: {},
			toolContext: makeToolContext("inv-zero-msg"),
			error: new Error("done"),
		});
		expect(out?.response_type).toBe(REFLECT_AND_RETRY_RESPONSE_TYPE);
		expect(out?.retry_count).toBe(0);
		expect(out?.reflection_guidance).toContain("retry limit exceeded");
		expect((plugin as any)._scopedFailureCounters).toEqual({});
	});

	it("maxRetries 0 exceed path still formats nullish args", async () => {
		const plugin = new ReflectAndRetryToolPlugin({
			maxRetries: 0,
			throwExceptionIfRetryExceeded: false,
		});
		const out = await plugin.onToolErrorCallback({
			tool: makeTool("z2"),
			toolArgs: { n: null, u: undefined },
			toolContext: makeToolContext("inv-zero-args"),
			error: "plain-string-error",
		});
		expect(out?.error_details).toBe("plain-string-error");
		expect(out?.reflection_guidance).toContain("- n: null");
		expect(out?.reflection_guidance).toContain("- u: undefined");
	});
});
