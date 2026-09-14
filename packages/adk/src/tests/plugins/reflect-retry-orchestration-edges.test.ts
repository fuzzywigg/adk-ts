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

describe("ReflectAndRetryToolPlugin max-retry exhaustion leftovers", () => {
	it.each([
		1, 2, 3, 5,
	])("throws original error after exhausting maxRetries=%s when configured to throw", async (maxRetries) => {
		const plugin = new ReflectAndRetryToolPlugin({
			maxRetries,
			throwExceptionIfRetryExceeded: true,
		});
		const tool = makeTool("exhaust_throw");
		const toolContext = makeToolContext();
		const finalError = new Error(`final-${maxRetries}`);

		for (let i = 1; i <= maxRetries; i++) {
			const response = await plugin.onToolErrorCallback({
				tool,
				toolArgs: { i },
				toolContext,
				error: new Error(`transient-${i}`),
			});
			expect(response?.retry_count).toBe(i);
			expect(response?.response_type).toBe(REFLECT_AND_RETRY_RESPONSE_TYPE);
		}

		await expect(
			plugin.onToolErrorCallback({
				tool,
				toolArgs: {},
				toolContext,
				error: finalError,
			}),
		).rejects.toBe(finalError);
	});

	it.each([
		1, 2, 4,
	])("returns exceed guidance after exhausting maxRetries=%s when throw is disabled", async (maxRetries) => {
		const plugin = new ReflectAndRetryToolPlugin({
			maxRetries,
			throwExceptionIfRetryExceeded: false,
		});
		const tool = makeTool("exhaust_msg");
		const toolContext = makeToolContext();

		for (let i = 1; i <= maxRetries; i++) {
			await plugin.onToolErrorCallback({
				tool,
				toolArgs: {},
				toolContext,
				error: new Error(`transient-${i}`),
			});
		}

		const exceeded = await plugin.onToolErrorCallback({
			tool,
			toolArgs: { last: true },
			toolContext,
			error: new Error("done"),
		});

		expect(exceeded).toMatchObject({
			response_type: REFLECT_AND_RETRY_RESPONSE_TYPE,
			retry_count: maxRetries,
			error_type: "Error",
		});
		expect(exceeded?.reflection_guidance).toContain("retry limit exceeded");
		expect(exceeded?.reflection_guidance).toContain("exhaust_msg");
		expect(exceeded?.reflection_guidance).toContain("last: true");
	});

	it("exhausts per-tool counters independently inside one invocation", async () => {
		const plugin = new ReflectAndRetryToolPlugin({
			maxRetries: 1,
			throwExceptionIfRetryExceeded: false,
		});
		const ctx = makeToolContext();
		const a = makeTool("tool_a");
		const b = makeTool("tool_b");

		await plugin.onToolErrorCallback({
			tool: a,
			toolArgs: {},
			toolContext: ctx,
			error: new Error("a1"),
		});
		await plugin.onToolErrorCallback({
			tool: b,
			toolArgs: {},
			toolContext: ctx,
			error: new Error("b1"),
		});

		const aExceeded = await plugin.onToolErrorCallback({
			tool: a,
			toolArgs: {},
			toolContext: ctx,
			error: new Error("a2"),
		});
		const bExceeded = await plugin.onToolErrorCallback({
			tool: b,
			toolArgs: {},
			toolContext: ctx,
			error: new Error("b2"),
		});

		expect(aExceeded?.retry_count).toBe(1);
		expect(aExceeded?.reflection_guidance).toContain("retry limit exceeded");
		expect(bExceeded?.retry_count).toBe(1);
		expect(bExceeded?.reflection_guidance).toContain("retry limit exceeded");
	});

	it("afterToolCallback exhaustion path returns exceed message without throw", async () => {
		class DetectingPlugin extends ReflectAndRetryToolPlugin {
			override async extractErrorFromResult(): Promise<Error> {
				return new Error("embedded-fail");
			}
		}

		const plugin = new DetectingPlugin({
			maxRetries: 1,
			throwExceptionIfRetryExceeded: false,
		});
		const tool = makeTool("writer");
		const toolContext = makeToolContext();

		const first = await plugin.afterToolCallback({
			tool,
			toolArgs: { path: "/tmp/a" },
			toolContext,
			result: { ok: false },
		});
		expect(first?.retry_count).toBe(1);

		const exceeded = await plugin.afterToolCallback({
			tool,
			toolArgs: { path: "/tmp/b" },
			toolContext,
			result: { ok: false },
		});
		expect(exceeded?.retry_count).toBe(1);
		expect(exceeded?.reflection_guidance).toContain("retry limit exceeded");
	});

	it("afterToolCallback exhaustion throws when configured", async () => {
		class DetectingPlugin extends ReflectAndRetryToolPlugin {
			override async extractErrorFromResult(): Promise<Error> {
				return new Error("embedded-throw");
			}
		}

		const plugin = new DetectingPlugin({
			maxRetries: 1,
			throwExceptionIfRetryExceeded: true,
		});
		const tool = makeTool("writer");
		const toolContext = makeToolContext();

		await plugin.afterToolCallback({
			tool,
			toolArgs: {},
			toolContext,
			result: { ok: false },
		});

		await expect(
			plugin.afterToolCallback({
				tool,
				toolArgs: {},
				toolContext,
				result: { ok: false },
			}),
		).rejects.toThrow("embedded-throw");
	});

	it("success reset allows a fresh exhaustion cycle", async () => {
		const plugin = new ReflectAndRetryToolPlugin({
			maxRetries: 1,
			throwExceptionIfRetryExceeded: false,
		});
		const tool = makeTool("cycler");
		const toolContext = makeToolContext();

		await plugin.onToolErrorCallback({
			tool,
			toolArgs: {},
			toolContext,
			error: new Error("first-cycle"),
		});
		const exceeded = await plugin.onToolErrorCallback({
			tool,
			toolArgs: {},
			toolContext,
			error: new Error("first-exceed"),
		});
		expect(exceeded?.reflection_guidance).toContain("retry limit exceeded");

		await plugin.afterToolCallback({
			tool,
			toolArgs: {},
			toolContext,
			result: { ok: true },
		});

		const restarted = await plugin.onToolErrorCallback({
			tool,
			toolArgs: {},
			toolContext,
			error: new Error("second-cycle"),
		});
		expect(restarted?.retry_count).toBe(1);
		expect(restarted?.reflection_guidance).toContain(
			"retry attempt **1 of 1**",
		);
	});

	it("GLOBAL scope exhaustion spans invocations", async () => {
		const plugin = new ReflectAndRetryToolPlugin({
			maxRetries: 1,
			throwExceptionIfRetryExceeded: true,
			trackingScope: TrackingScope.GLOBAL,
		});
		const tool = makeTool("global_tool");

		await plugin.onToolErrorCallback({
			tool,
			toolArgs: {},
			toolContext: makeToolContext("inv-1"),
			error: new Error("one"),
		});

		await expect(
			plugin.onToolErrorCallback({
				tool,
				toolArgs: {},
				toolContext: makeToolContext("inv-2"),
				error: new Error("two"),
			}),
		).rejects.toThrow("two");
	});

	it("serializes concurrent errors so only maxRetries reflections succeed before throw", async () => {
		const plugin = new ReflectAndRetryToolPlugin({
			maxRetries: 2,
			throwExceptionIfRetryExceeded: true,
		});
		const tool = makeTool("race");
		const toolContext = makeToolContext();

		const outcomes = await Promise.allSettled(
			Array.from({ length: 4 }, (_, i) =>
				plugin.onToolErrorCallback({
					tool,
					toolArgs: { i },
					toolContext,
					error: new Error(`e${i}`),
				}),
			),
		);

		const fulfilled = outcomes.filter((o) => o.status === "fulfilled");
		const rejected = outcomes.filter((o) => o.status === "rejected");

		expect(fulfilled).toHaveLength(2);
		expect(rejected).toHaveLength(2);
		expect(
			fulfilled
				.map((o) => (o as PromiseFulfilledResult<any>).value.retry_count)
				.sort(),
		).toEqual([1, 2]);
	});
});
