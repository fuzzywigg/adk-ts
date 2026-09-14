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

describe("ReflectAndRetryToolPlugin deepen edges (TOKENMAXX remainder)", () => {
	it("allows maxRetries of zero without throwing in the constructor", () => {
		const plugin = new ReflectAndRetryToolPlugin({ maxRetries: 0 });
		expect(plugin.maxRetries).toBe(0);
	});

	it("accepts custom name and GLOBAL tracking scope", () => {
		const plugin = new ReflectAndRetryToolPlugin({
			name: "custom_reflect",
			trackingScope: TrackingScope.GLOBAL,
			throwExceptionIfRetryExceeded: false,
		});
		expect(plugin.name).toBe("custom_reflect");
		expect(plugin.scope).toBe(TrackingScope.GLOBAL);
		expect(plugin.throwExceptionIfRetryExceeded).toBe(false);
	});

	it("afterToolCallback ignores reflect responses without touching counters", async () => {
		const plugin = new ReflectAndRetryToolPlugin({ maxRetries: 2 });
		const toolContext = makeToolContext("inv-ignore");
		await plugin.afterToolCallback({
			tool: makeTool(),
			toolArgs: {},
			toolContext,
			result: {
				response_type: REFLECT_AND_RETRY_RESPONSE_TYPE,
				error_type: "ToolError",
			},
		});
		expect((plugin as any)._scopedFailureCounters).toEqual({});
	});

	it("resets per-tool counters so the next failure starts at retry 1", async () => {
		const plugin = new ReflectAndRetryToolPlugin({
			maxRetries: 3,
			throwExceptionIfRetryExceeded: false,
		});
		const tool = makeTool("t");
		const toolContext = makeToolContext("inv-reset");

		await plugin.onToolErrorCallback({
			tool,
			toolArgs: {},
			toolContext,
			error: new Error("first"),
		});
		await plugin.afterToolCallback({
			tool,
			toolArgs: {},
			toolContext,
			result: { ok: true },
		});

		const again = await plugin.onToolErrorCallback({
			tool,
			toolArgs: {},
			toolContext,
			error: new Error("second"),
		});
		expect(again?.retry_count).toBe(1);
	});

	it("shares failure counters across invocations in GLOBAL scope", async () => {
		const plugin = new ReflectAndRetryToolPlugin({
			maxRetries: 5,
			throwExceptionIfRetryExceeded: false,
			trackingScope: TrackingScope.GLOBAL,
		});
		const tool = makeTool("g");

		const first = await plugin.onToolErrorCallback({
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

		expect(first?.retry_count).toBe(1);
		expect(second?.retry_count).toBe(2);
		expect((plugin as any)._scopedFailureCounters[GLOBAL_SCOPE_KEY].g).toBe(2);
	});

	it("defaults error_type to ToolError when error.name is missing", async () => {
		const plugin = new ReflectAndRetryToolPlugin({
			maxRetries: 2,
			throwExceptionIfRetryExceeded: false,
		});
		const nameless = { message: "no-name" };

		const result = await plugin.onToolErrorCallback({
			tool: makeTool(),
			toolArgs: { q: 1 },
			toolContext: makeToolContext(),
			error: nameless,
		});

		expect(result?.response_type).toBe(REFLECT_AND_RETRY_RESPONSE_TYPE);
		expect(result?.error_type).toBe("ToolError");
		expect(result?.error_details).toBe(String(nameless));
	});

	it("maxRetries 0 with throw disabled returns exceed message with retry_count 0", async () => {
		const plugin = new ReflectAndRetryToolPlugin({
			maxRetries: 0,
			throwExceptionIfRetryExceeded: false,
		});
		const response = await plugin.onToolErrorCallback({
			tool: makeTool("z"),
			toolArgs: {},
			toolContext: makeToolContext("inv-zero"),
			error: new Error("blocked"),
		});
		expect(response?.retry_count).toBe(0);
		expect(response?.reflection_guidance).toMatch(/retry limit exceeded/i);
	});

	it("extractErrorFromResult default returns undefined", async () => {
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
});
