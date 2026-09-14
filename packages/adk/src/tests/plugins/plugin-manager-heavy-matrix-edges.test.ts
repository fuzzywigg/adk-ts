import { describe, expect, it, vi } from "vitest";
import { BasePlugin } from "../../plugins/base-plugin";
import {
	PluginManager,
	pluginCallbackNameSchema,
} from "../../plugins/plugin-manager";

class CountingPlugin extends BasePlugin {
	calls: string[] = [];
	constructor(
		name: string,
		private readonly returns: Record<string, any> = {},
	) {
		super(name);
	}

	async beforeRunCallback(): Promise<any> {
		this.calls.push("beforeRun");
		return this.returns.beforeRun;
	}

	async afterRunCallback(): Promise<any> {
		this.calls.push("afterRun");
		return this.returns.afterRun;
	}

	async onUserMessageCallback(): Promise<any> {
		this.calls.push("onUserMessage");
		return this.returns.onUserMessage;
	}

	async beforeAgentCallback(): Promise<any> {
		this.calls.push("beforeAgent");
		return this.returns.beforeAgent;
	}

	async afterAgentCallback(): Promise<any> {
		this.calls.push("afterAgent");
		return this.returns.afterAgent;
	}

	async beforeToolCallback(): Promise<any> {
		this.calls.push("beforeTool");
		return this.returns.beforeTool;
	}

	async afterToolCallback(): Promise<any> {
		this.calls.push("afterTool");
		return this.returns.afterTool;
	}

	async beforeModelCallback(): Promise<any> {
		this.calls.push("beforeModel");
		return this.returns.beforeModel;
	}

	async afterModelCallback(): Promise<any> {
		this.calls.push("afterModel");
		return this.returns.afterModel;
	}

	async onEventCallback(): Promise<any> {
		this.calls.push("onEvent");
		return this.returns.onEvent;
	}

	async onToolErrorCallback(): Promise<any> {
		this.calls.push("onToolError");
		return this.returns.onToolError;
	}

	async onModelErrorCallback(): Promise<any> {
		this.calls.push("onModelError");
		return this.returns.onModelError;
	}
}

describe("PluginManager heavy matrix leftover edges", () => {
	it("registerPlugin rejects duplicate names", () => {
		const manager = new PluginManager({
			plugins: [new CountingPlugin("dup")],
		});
		expect(() => manager.registerPlugin(new CountingPlugin("dup"))).toThrow(
			/already registered/,
		);
	});

	it("getPlugin/getPlugins reflect registration order", () => {
		const a = new CountingPlugin("a");
		const b = new CountingPlugin("b");
		const manager = new PluginManager({ plugins: [a, b] });
		expect(manager.getPlugin("a")).toBe(a);
		expect(manager.getPlugin("missing")).toBeUndefined();
		expect(manager.getPlugins()).toEqual([a, b]);
	});

	it("defaults closeTimeout to 5000", () => {
		const manager = new PluginManager();
		expect((manager as any).closeTimeout).toBe(5000);
	});

	it.each([
		{
			method: "runBeforeRunCallback",
			params: { invocationContext: {} },
			key: "beforeRun",
		},
		{
			method: "runAfterRunCallback",
			params: { invocationContext: {} },
			key: "afterRun",
		},
		{
			method: "runOnUserMessageCallback",
			params: { userMessage: {}, invocationContext: {} },
			key: "onUserMessage",
		},
		{
			method: "runOnEventCallback",
			params: { invocationContext: {}, event: {} },
			key: "onEvent",
		},
		{
			method: "runBeforeAgentCallback",
			params: { agent: {}, callbackContext: {} },
			key: "beforeAgent",
		},
		{
			method: "runAfterAgentCallback",
			params: { agent: {}, callbackContext: {} },
			key: "afterAgent",
		},
		{
			method: "runBeforeToolCallback",
			params: { tool: {}, toolArgs: {}, toolContext: {} },
			key: "beforeTool",
		},
		{
			method: "runAfterToolCallback",
			params: { tool: {}, toolArgs: {}, toolContext: {}, result: {} },
			key: "afterTool",
		},
		{
			method: "runBeforeModelCallback",
			params: { callbackContext: {}, llmRequest: {} },
			key: "beforeModel",
		},
		{
			method: "runAfterModelCallback",
			params: { callbackContext: {}, llmResponse: {} },
			key: "afterModel",
		},
		{
			method: "runOnToolErrorCallback",
			params: {
				tool: {},
				toolArgs: {},
				toolContext: {},
				error: new Error("t"),
			},
			key: "onToolError",
		},
		{
			method: "runOnModelErrorCallback",
			params: {
				callbackContext: {},
				llmRequest: {},
				error: new Error("m"),
			},
			key: "onModelError",
		},
	] as const)("$method early-exits on first non-undefined plugin result", async ({
		method,
		params,
		key,
	}) => {
		const first = new CountingPlugin("first");
		const second = new CountingPlugin("second", { [key]: { hit: key } });
		const third = new CountingPlugin("third", { [key]: { hit: "third" } });
		const manager = new PluginManager({ plugins: [first, second, third] });
		const result = await (manager as any)[method](params);
		expect(result).toEqual({ hit: key });
		expect(third.calls).toEqual([]);
	});

	it("returns undefined when all plugins return undefined", async () => {
		const manager = new PluginManager({
			plugins: [new CountingPlugin("a"), new CountingPlugin("b")],
		});
		await expect(
			manager.runBeforeRunCallback({ invocationContext: {} as any }),
		).resolves.toBeUndefined();
	});

	it.each([
		{ label: "Error", throwValue: new Error("boom"), expected: "boom" },
		{ label: "string", throwValue: "boom-str", expected: "boom-str" },
	])("wraps plugin $label throw with plugin/callback context", async ({
		throwValue,
		expected,
	}) => {
		class Exploding extends BasePlugin {
			async beforeRunCallback(): Promise<any> {
				throw throwValue;
			}
		}
		const manager = new PluginManager({
			plugins: [new Exploding("explode")],
		});
		await expect(
			manager.runBeforeRunCallback({ invocationContext: {} as any }),
		).rejects.toThrow(
			`Error in plugin 'explode' during 'beforeRunCallback' callback: ${expected}`,
		);
	});

	it("close aggregates failures including timeouts and non-Errors", async () => {
		class Slow extends BasePlugin {
			async close(): Promise<void> {
				await new Promise((r) => setTimeout(r, 50));
			}
		}
		class Failing extends BasePlugin {
			async close(): Promise<void> {
				throw "close-str";
			}
		}
		class Ok extends BasePlugin {
			async close(): Promise<void> {}
		}
		const manager = new PluginManager({
			plugins: [new Slow("slow"), new Failing("fail"), new Ok("ok")],
			closeTimeout: 5,
		});
		await expect(manager.close()).rejects.toThrow(/Failed to close plugins/);
	});

	it("close succeeds when all plugins close quickly", async () => {
		const closed = vi.fn(async () => undefined);
		class Ok extends BasePlugin {
			async close(): Promise<void> {
				await closed();
			}
		}
		const manager = new PluginManager({
			plugins: [new Ok("ok1"), new Ok("ok2")],
			closeTimeout: 1000,
		});
		await expect(manager.close()).resolves.toBeUndefined();
		expect(closed).toHaveBeenCalledTimes(2);
	});

	it("pluginCallbackNameSchema enumerates all callback names", () => {
		expect(pluginCallbackNameSchema.options).toEqual([
			"onUserMessageCallback",
			"beforeRunCallback",
			"afterRunCallback",
			"onEventCallback",
			"beforeAgentCallback",
			"afterAgentCallback",
			"beforeToolCallback",
			"afterToolCallback",
			"beforeModelCallback",
			"afterModelCallback",
			"onToolErrorCallback",
			"onModelErrorCallback",
		]);
	});
});
