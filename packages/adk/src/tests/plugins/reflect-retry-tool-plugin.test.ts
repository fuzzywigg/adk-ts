import { describe, expect, it } from "vitest";
import type { InvocationContext } from "../../agents/invocation-context";
import {
	GLOBAL_SCOPE_KEY,
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

describe("ReflectAndRetryToolPlugin", () => {
	it("rejects negative maxRetries", () => {
		expect(() => new ReflectAndRetryToolPlugin({ maxRetries: -1 })).toThrow(
			/non-negative/,
		);
	});

	it("uses defaults for name and retry settings", () => {
		const plugin = new ReflectAndRetryToolPlugin();
		expect(plugin.name).toBe("reflect_retry_tool_plugin");
		expect(plugin.maxRetries).toBe(3);
		expect(plugin.throwExceptionIfRetryExceeded).toBe(true);
		expect(plugin.scope).toBe(TrackingScope.INVOCATION);
	});

	it("ignores reflect-and-retry response types in afterToolCallback", async () => {
		const plugin = new ReflectAndRetryToolPlugin();
		const result = await plugin.afterToolCallback({
			tool: makeTool(),
			toolArgs: {},
			toolContext: makeToolContext(),
			result: { response_type: REFLECT_AND_RETRY_RESPONSE_TYPE },
		});
		expect(result).toBeUndefined();
	});

	it("resets failure counters on successful afterToolCallback", async () => {
		const plugin = new ReflectAndRetryToolPlugin({ maxRetries: 2 });
		const tool = makeTool();
		const toolContext = makeToolContext();

		const first = await plugin.onToolErrorCallback({
			tool,
			toolArgs: { q: "a" },
			toolContext,
			error: new Error("boom"),
		});
		expect(first?.response_type).toBe(REFLECT_AND_RETRY_RESPONSE_TYPE);
		expect(first?.retry_count).toBe(1);

		await plugin.afterToolCallback({
			tool,
			toolArgs: { q: "a" },
			toolContext,
			result: { ok: true },
		});

		const afterReset = await plugin.onToolErrorCallback({
			tool,
			toolArgs: { q: "b" },
			toolContext,
			error: new Error("again"),
		});
		expect(afterReset?.retry_count).toBe(1);
	});

	it("returns reflection guidance while retries remain", async () => {
		const plugin = new ReflectAndRetryToolPlugin({ maxRetries: 2 });
		const response = await plugin.onToolErrorCallback({
			tool: makeTool("search"),
			toolArgs: { query: "adk" },
			toolContext: makeToolContext(),
			error: new TypeError("bad input"),
		});

		expect(response).toMatchObject({
			response_type: REFLECT_AND_RETRY_RESPONSE_TYPE,
			error_type: "TypeError",
			retry_count: 1,
		});
		expect(response?.error_details).toContain("TypeError: bad input");
		expect(response?.reflection_guidance).toContain("search");
		expect(response?.reflection_guidance).toContain("query: adk");
	});

	it("throws when retry limit exceeded and configured to throw", async () => {
		const plugin = new ReflectAndRetryToolPlugin({
			maxRetries: 1,
			throwExceptionIfRetryExceeded: true,
		});
		const tool = makeTool();
		const toolContext = makeToolContext();
		const error = new Error("final");

		await plugin.onToolErrorCallback({
			tool,
			toolArgs: {},
			toolContext,
			error,
		});

		await expect(
			plugin.onToolErrorCallback({
				tool,
				toolArgs: {},
				toolContext,
				error,
			}),
		).rejects.toThrow("final");
	});

	it("returns exceed message when throwExceptionIfRetryExceeded is false", async () => {
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
			error: new Error("one"),
		});

		const exceeded = await plugin.onToolErrorCallback({
			tool,
			toolArgs: {},
			toolContext,
			error: new Error("two"),
		});

		expect(exceeded?.retry_count).toBe(1);
		expect(exceeded?.reflection_guidance).toContain("retry limit exceeded");
		expect(exceeded?.reflection_guidance).toContain("writer");
	});

	it("rethrows immediately when maxRetries is 0 and throw is enabled", async () => {
		const plugin = new ReflectAndRetryToolPlugin({
			maxRetries: 0,
			throwExceptionIfRetryExceeded: true,
		});

		await expect(
			plugin.onToolErrorCallback({
				tool: makeTool(),
				toolArgs: {},
				toolContext: makeToolContext(),
				error: new Error("instant"),
			}),
		).rejects.toThrow("instant");
	});

	it("tracks failures globally when scope is GLOBAL", async () => {
		const plugin = new ReflectAndRetryToolPlugin({
			maxRetries: 2,
			trackingScope: TrackingScope.GLOBAL,
		});
		const tool = makeTool();

		await plugin.onToolErrorCallback({
			tool,
			toolArgs: {},
			toolContext: makeToolContext("inv-a"),
			error: new Error("a"),
		});
		const second = await plugin.onToolErrorCallback({
			tool,
			toolArgs: {},
			toolContext: makeToolContext("inv-b"),
			error: new Error("b"),
		});

		expect(second?.retry_count).toBe(2);
		expect(GLOBAL_SCOPE_KEY).toBe("__global_reflect_and_retry_scope__");
	});

	it("extractErrorFromResult defaults to undefined", async () => {
		const plugin = new ReflectAndRetryToolPlugin();
		await expect(
			plugin.extractErrorFromResult({
				tool: makeTool(),
				toolArgs: {},
				toolContext: makeToolContext(),
				result: { ok: true },
			}),
		).resolves.toBeUndefined();
	});

	it("formats empty args as no arguments in reflection", async () => {
		const plugin = new ReflectAndRetryToolPlugin({ maxRetries: 1 });
		const response = await plugin.onToolErrorCallback({
			tool: makeTool(),
			toolArgs: {},
			toolContext: makeToolContext(),
			error: "string-error",
		});

		expect(response?.error_type).toBe("ToolError");
		expect(response?.reflection_guidance).toContain("(no arguments)");
		expect(response?.error_details).toBe("string-error");
	});

	it("afterToolCallback handles extracted errors from subclass extractErrorFromResult", async () => {
		class ExtractingPlugin extends ReflectAndRetryToolPlugin {
			override async extractErrorFromResult(): Promise<Error> {
				return new Error("from-result");
			}
		}

		const plugin = new ExtractingPlugin({ maxRetries: 2 });
		const response = await plugin.afterToolCallback({
			tool: makeTool("parser"),
			toolArgs: { n: 1 },
			toolContext: makeToolContext(),
			result: { ok: false },
		});

		expect(response).toMatchObject({
			response_type: REFLECT_AND_RETRY_RESPONSE_TYPE,
			error_details: expect.stringContaining("from-result"),
			retry_count: 1,
		});
	});
});
