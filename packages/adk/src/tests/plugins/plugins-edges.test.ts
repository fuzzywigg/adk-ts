import { describe, expect, it, vi } from "vitest";
import { BasePlugin } from "../../plugins/base-plugin";
import { PluginManager } from "../../plugins/plugin-manager";
import {
	REFLECT_AND_RETRY_RESPONSE_TYPE,
	ReflectAndRetryToolPlugin,
} from "../../plugins/reflect-retry-tool-plugin";
import type { BaseTool } from "../../tools/base/base-tool";

function makeTool(name = "search"): BaseTool {
	return {
		name,
		description: "search",
		isLongRunning: false,
		shouldRetryOnFailure: false,
		maxRetryAttempts: 0,
	} as BaseTool;
}

function makeToolContext() {
	return {
		invocationId: "inv-1",
		functionCallId: "fc-1",
	} as any;
}

describe("plugins leftover edges (post #124)", () => {
	it("PluginManager skips plugins that omit the requested callback", async () => {
		class EmptyPlugin extends BasePlugin {
			constructor() {
				super("empty");
			}
		}
		class ResultPlugin extends BasePlugin {
			constructor() {
				super("has-callback");
			}
			async beforeRunCallback(): Promise<any> {
				return { ok: true };
			}
		}

		const manager = new PluginManager({
			plugins: [new EmptyPlugin(), new ResultPlugin()],
		});

		const result = await manager.runBeforeRunCallback({
			invocationContext: {} as any,
		});
		expect(result).toEqual({ ok: true });
	});

	it("PluginManager.close skips plugins without close and closes others", async () => {
		class NoClose extends BasePlugin {
			constructor() {
				super("no-close");
			}
		}
		const close = vi.fn(async () => undefined);
		class WithClose extends BasePlugin {
			constructor() {
				super("with-close");
			}
			async close(): Promise<void> {
				await close();
			}
		}

		const manager = new PluginManager({
			plugins: [new NoClose(), new WithClose()],
			closeTimeout: 1000,
		});

		await expect(manager.close()).resolves.toBeUndefined();
		expect(close).toHaveBeenCalledOnce();
	});

	it("ReflectAndRetryToolPlugin uses ToolError when error is nullish", async () => {
		const plugin = new ReflectAndRetryToolPlugin({
			maxRetries: 0,
			throwExceptionIfRetryExceeded: false,
		});
		const response = await plugin.onToolErrorCallback({
			tool: makeTool(),
			toolArgs: { q: "x" },
			toolContext: makeToolContext(),
			error: null,
		});

		expect(response?.response_type).toBe(REFLECT_AND_RETRY_RESPONSE_TYPE);
		expect(response?.error_type).toBe("ToolError");
	});

	it("ReflectAndRetryToolPlugin preserves empty Error.name via ?? only for nullish", async () => {
		const plugin = new ReflectAndRetryToolPlugin({ maxRetries: 1 });
		const nameless = new Error("boom");
		nameless.name = "";

		const response = await plugin.onToolErrorCallback({
			tool: makeTool("writer"),
			toolArgs: {},
			toolContext: makeToolContext(),
			error: nameless,
		});

		expect(response?.error_type).toBe("");
		expect(response?.retry_count).toBe(1);
	});

	it("ReflectAndRetryToolPlugin exceed path uses ToolError for undefined error", async () => {
		const plugin = new ReflectAndRetryToolPlugin({
			maxRetries: 1,
			throwExceptionIfRetryExceeded: false,
		});
		await plugin.onToolErrorCallback({
			tool: makeTool(),
			toolArgs: { a: 1 },
			toolContext: makeToolContext(),
			error: new Error("first"),
		});

		const exceeded = await plugin.onToolErrorCallback({
			tool: makeTool(),
			toolArgs: { a: 1 },
			toolContext: makeToolContext(),
			error: undefined,
		});

		expect(exceeded?.error_type).toBe("ToolError");
		expect(exceeded?.retry_count).toBe(1);
		expect(exceeded?.reflection_guidance).toContain("retry limit exceeded");
	});
});
