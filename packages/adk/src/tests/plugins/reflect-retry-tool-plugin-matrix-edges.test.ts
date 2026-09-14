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

describe("ReflectAndRetryToolPlugin matrix edges (TOKENMAXX leftovers)", () => {
	it.each([
		{ label: "string error", error: "string-error", expected: "ToolError" },
		{ label: "plain object", error: { msg: "x" }, expected: "ToolError" },
		{ label: "null error", error: null, expected: "ToolError" },
		{ label: "undefined error", error: undefined, expected: "ToolError" },
	])("_getToolRetryExceedMsg uses ToolError fallback for $label", async ({
		error,
		expected,
	}) => {
		const plugin = new ReflectAndRetryToolPlugin({
			maxRetries: 1,
			throwExceptionIfRetryExceeded: false,
		});
		const tool = makeTool("writer");
		const toolContext = makeToolContext();

		await plugin.onToolErrorCallback({
			tool,
			toolArgs: {},
			toolContext,
			error: new Error("warmup"),
		});

		const exceeded = await plugin.onToolErrorCallback({
			tool,
			toolArgs: { path: "/tmp/x" },
			toolContext,
			error,
		});

		expect(exceeded?.response_type).toBe(REFLECT_AND_RETRY_RESPONSE_TYPE);
		expect(exceeded?.error_type).toBe(expected);
		expect(exceeded?.retry_count).toBe(1);
		expect(exceeded?.reflection_guidance).toContain("retry limit exceeded");
	});

	it("returns exceed message immediately for nameless errors when maxRetries is 0", async () => {
		const plugin = new ReflectAndRetryToolPlugin({
			maxRetries: 0,
			throwExceptionIfRetryExceeded: false,
		});

		const exceeded = await plugin.onToolErrorCallback({
			tool: makeTool("x"),
			toolArgs: {},
			toolContext: makeToolContext(),
			error: "instant-string",
		});

		expect(exceeded?.error_type).toBe("ToolError");
		expect(exceeded?.error_details).toBe("instant-string");
		expect(exceeded?.retry_count).toBe(0);
	});
});
