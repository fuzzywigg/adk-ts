import { describe, expect, it, vi } from "vitest";
import { BasePlugin } from "../../plugins/base-plugin";
import {
	ReflectAndRetryToolPlugin,
	REFLECT_AND_RETRY_RESPONSE_TYPE,
	TrackingScope,
} from "../../plugins/reflect-retry-tool-plugin";
import type { BaseTool } from "../../tools/base/base-tool";
import type { ToolContext } from "../../tools/tool-context";

class DemoPlugin extends BasePlugin {}

describe("BasePlugin", () => {
	it("stores name and returns undefined defaults", async () => {
		const plugin = new DemoPlugin("demo");
		expect(plugin.name).toBe("demo");
		await expect(
			plugin.onUserMessageCallback?.({
				invocationContext: {} as never,
				userMessage: { role: "user", parts: [] },
			}),
		).resolves.toBeUndefined();
		await expect(
			plugin.beforeRunCallback?.({ invocationContext: {} as never }),
		).resolves.toBeUndefined();
		await expect(plugin.close?.()).resolves.toBeUndefined();
	});
});

describe("ReflectAndRetryToolPlugin", () => {
	const tool = { name: "flaky" } as BaseTool;
	const toolContext = {
		invocationId: "inv-1",
	} as ToolContext;

	it("rejects negative maxRetries", () => {
		expect(() => new ReflectAndRetryToolPlugin({ maxRetries: -1 })).toThrow(
			/non-negative/,
		);
	});

	it("ignores already handled reflection responses", async () => {
		const plugin = new ReflectAndRetryToolPlugin({ maxRetries: 2 });
		await expect(
			plugin.afterToolCallback({
				tool,
				toolArgs: {},
				toolContext,
				result: { response_type: REFLECT_AND_RETRY_RESPONSE_TYPE },
			}),
		).resolves.toBeUndefined();
	});

	it("creates reflection guidance on tool errors", async () => {
		const plugin = new ReflectAndRetryToolPlugin({
			maxRetries: 2,
			throwExceptionIfRetryExceeded: false,
			trackingScope: TrackingScope.INVOCATION,
		});

		const response = await plugin.onToolErrorCallback({
			tool,
			toolArgs: { x: 1 },
			toolContext,
			error: new Error("boom"),
		});

		expect(response?.response_type).toBe(REFLECT_AND_RETRY_RESPONSE_TYPE);
		expect(response?.retry_count).toBe(1);
		expect(response?.error_details).toContain("boom");
		expect(response?.reflection_guidance).toBeTruthy();
	});

	it("resets failure counters after successful tool results", async () => {
		const plugin = new ReflectAndRetryToolPlugin({ maxRetries: 2 });
		const extract = vi
			.spyOn(plugin, "extractErrorFromResult")
			.mockResolvedValue(undefined);

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

		expect(extract).toHaveBeenCalled();
	});
});
