import { describe, expect, it, vi } from "vitest";
import { BasePlugin } from "../../plugins/base-plugin";
import {
	PluginManager,
	pluginCallbackNameSchema,
} from "../../plugins/plugin-manager";

class TestPlugin extends BasePlugin {
	beforeRunCalls = 0;

	constructor(
		name: string,
		private readonly beforeRunResult?: unknown,
		private readonly shouldThrow = false,
	) {
		super(name);
	}

	async beforeRunCallback(): Promise<any> {
		this.beforeRunCalls += 1;
		if (this.shouldThrow) {
			throw new Error("callback failed");
		}
		return this.beforeRunResult;
	}
}

class ClosePlugin extends BasePlugin {
	constructor(
		name: string,
		private readonly closeImpl: () => Promise<void>,
	) {
		super(name);
	}

	async close(): Promise<void> {
		await this.closeImpl();
	}
}

describe("PluginManager", () => {
	it("registers uniquely named plugins", () => {
		const manager = new PluginManager({
			plugins: [new TestPlugin("one")],
		});
		expect(manager.getPlugin("one")?.name).toBe("one");
		expect(manager.getPlugins()).toHaveLength(1);

		expect(() => manager.registerPlugin(new TestPlugin("one"))).toThrow(
			/already registered/,
		);
	});

	it("returns the first non-undefined callback result", async () => {
		const first = new TestPlugin("first");
		const second = new TestPlugin("second", { stopped: true });
		const third = new TestPlugin("third", { ignored: true });
		const manager = new PluginManager({ plugins: [first, second, third] });

		const result = await manager.runBeforeRunCallback({
			invocationContext: {} as any,
		});

		expect(result).toEqual({ stopped: true });
		expect(first.beforeRunCalls).toBe(1);
		expect(second.beforeRunCalls).toBe(1);
		expect(third.beforeRunCalls).toBe(0);
	});

	it("wraps callback errors with the plugin name", async () => {
		const manager = new PluginManager({
			plugins: [new TestPlugin("broken", undefined, true)],
		});

		await expect(
			manager.runBeforeRunCallback({ invocationContext: {} as any }),
		).rejects.toThrow(/Error in plugin 'broken' during 'beforeRunCallback'/);
	});

	it("closes plugins and reports timeouts", async () => {
		const ok = new ClosePlugin("ok", async () => undefined);
		const slow = new ClosePlugin(
			"slow",
			() => new Promise((resolve) => setTimeout(resolve, 50)),
		);
		const manager = new PluginManager({
			plugins: [ok, slow],
			closeTimeout: 5,
		});

		await expect(manager.close()).rejects.toThrow(/Failed to close plugins/);
	});

	it("closes successfully when all plugins finish in time", async () => {
		const close = vi.fn(async () => undefined);
		const manager = new PluginManager({
			plugins: [new ClosePlugin("ok", close)],
			closeTimeout: 1000,
		});

		await expect(manager.close()).resolves.toBeUndefined();
		expect(close).toHaveBeenCalledOnce();
	});

	it("close resolves when plugins omit a close method", async () => {
		const manager = new PluginManager({
			plugins: [new TestPlugin("no-close")],
			closeTimeout: 1000,
		});

		await expect(manager.close()).resolves.toBeUndefined();
	});

	it("stringifies non-Error callback throws in the wrapper message", async () => {
		class StringThrowPlugin extends BasePlugin {
			constructor() {
				super("string-throw");
			}
			async beforeRunCallback(): Promise<any> {
				throw "plain-string-failure";
			}
		}
		const manager = new PluginManager({
			plugins: [new StringThrowPlugin()],
		});

		await expect(
			manager.runBeforeRunCallback({ invocationContext: {} as any }),
		).rejects.toThrow(
			/Error in plugin 'string-throw' during 'beforeRunCallback' callback: plain-string-failure/,
		);
	});

	it("runs additional callback runners and short-circuits on first result", async () => {
		class MultiPlugin extends BasePlugin {
			calls: string[] = [];

			constructor(
				name: string,
				private readonly results: Partial<Record<string, unknown>>,
			) {
				super(name);
			}

			async onUserMessageCallback(): Promise<any> {
				this.calls.push("user");
				return this.results.user;
			}
			async afterRunCallback(): Promise<any> {
				this.calls.push("afterRun");
				return this.results.afterRun;
			}
			async onEventCallback(): Promise<any> {
				this.calls.push("event");
				return this.results.event;
			}
			async beforeAgentCallback(): Promise<any> {
				this.calls.push("beforeAgent");
				return this.results.beforeAgent;
			}
			async afterAgentCallback(): Promise<any> {
				this.calls.push("afterAgent");
				return this.results.afterAgent;
			}
			async beforeToolCallback(): Promise<any> {
				this.calls.push("beforeTool");
				return this.results.beforeTool;
			}
			async afterToolCallback(): Promise<any> {
				this.calls.push("afterTool");
				return this.results.afterTool;
			}
			async beforeModelCallback(): Promise<any> {
				this.calls.push("beforeModel");
				return this.results.beforeModel;
			}
			async afterModelCallback(): Promise<any> {
				this.calls.push("afterModel");
				return this.results.afterModel;
			}
			async onToolErrorCallback(): Promise<any> {
				this.calls.push("toolError");
				return this.results.toolError;
			}
			async onModelErrorCallback(): Promise<any> {
				this.calls.push("modelError");
				return this.results.modelError;
			}
		}

		const first = new MultiPlugin("first", {});
		const second = new MultiPlugin("second", {
			user: { rewritten: true },
			afterRun: { done: true },
			event: { patched: true },
			beforeAgent: { skip: true },
			afterAgent: { out: 1 },
			beforeTool: { args: {} },
			afterTool: { result: 2 },
			beforeModel: { req: true },
			afterModel: { res: true },
			toolError: { recovered: true },
			modelError: { fallback: true },
		});
		const third = new MultiPlugin("third", {
			user: { ignored: true },
		});
		const manager = new PluginManager({ plugins: [first, second, third] });

		await expect(
			manager.runOnUserMessageCallback({
				userMessage: { role: "user", parts: [] } as any,
				invocationContext: {} as any,
			}),
		).resolves.toEqual({ rewritten: true });
		await expect(
			manager.runAfterRunCallback({ invocationContext: {} as any }),
		).resolves.toEqual({ done: true });
		await expect(
			manager.runOnEventCallback({
				invocationContext: {} as any,
				event: {} as any,
			}),
		).resolves.toEqual({ patched: true });
		await expect(
			manager.runBeforeAgentCallback({
				agent: {} as any,
				callbackContext: {} as any,
			}),
		).resolves.toEqual({ skip: true });
		await expect(
			manager.runAfterAgentCallback({
				agent: {} as any,
				callbackContext: {} as any,
			}),
		).resolves.toEqual({ out: 1 });
		await expect(
			manager.runBeforeToolCallback({
				tool: {} as any,
				toolArgs: {},
				toolContext: {} as any,
			}),
		).resolves.toEqual({ args: {} });
		await expect(
			manager.runAfterToolCallback({
				tool: {} as any,
				toolArgs: {},
				toolContext: {} as any,
				result: {},
			}),
		).resolves.toEqual({ result: 2 });
		await expect(
			manager.runBeforeModelCallback({
				callbackContext: {} as any,
				llmRequest: {} as any,
			}),
		).resolves.toEqual({ req: true });
		await expect(
			manager.runAfterModelCallback({
				callbackContext: {} as any,
				llmResponse: {} as any,
			}),
		).resolves.toEqual({ res: true });
		await expect(
			manager.runOnToolErrorCallback({
				tool: {} as any,
				toolArgs: {},
				toolContext: {} as any,
				error: new Error("tool"),
			}),
		).resolves.toEqual({ recovered: true });
		await expect(
			manager.runOnModelErrorCallback({
				callbackContext: {} as any,
				llmRequest: {} as any,
				error: new Error("model"),
			}),
		).resolves.toEqual({ fallback: true });

		expect(third.calls).toEqual([]);
		expect(
			pluginCallbackNameSchema.safeParse("beforeRunCallback").success,
		).toBe(true);
		expect(pluginCallbackNameSchema.safeParse("unknownCallback").success).toBe(
			false,
		);
	});

	it("returns undefined when every plugin callback returns undefined", async () => {
		const manager = new PluginManager({
			plugins: [new TestPlugin("a"), new TestPlugin("b")],
		});
		await expect(
			manager.runBeforeRunCallback({ invocationContext: {} as any }),
		).resolves.toBeUndefined();
	});

	it("skips plugins that omit the requested callback method", async () => {
		class PartialPlugin extends BasePlugin {
			constructor(name: string) {
				super(name);
			}
		}
		const partial = new PartialPlugin("partial");
		const answering = new TestPlugin("answering", { hit: true });
		const manager = new PluginManager({ plugins: [partial, answering] });

		await expect(
			manager.runBeforeRunCallback({ invocationContext: {} as any }),
		).resolves.toEqual({ hit: true });
	});

	it("getPlugin returns undefined for unknown names", () => {
		const manager = new PluginManager();
		expect(manager.getPlugin("missing")).toBeUndefined();
		expect(manager.getPlugins()).toEqual([]);
	});

	it("registers plugins after construction", () => {
		const manager = new PluginManager();
		manager.registerPlugin(new TestPlugin("late"));
		expect(manager.getPlugin("late")?.name).toBe("late");
		expect(manager.getPlugins()).toHaveLength(1);
	});

	it("aggregates multiple close failures into one error message", async () => {
		const first = new ClosePlugin("first", async () => {
			throw new Error("boom-one");
		});
		const second = new ClosePlugin("second", async () => {
			throw "boom-two";
		});
		const manager = new PluginManager({
			plugins: [first, second],
			closeTimeout: 1000,
		});

		await expect(manager.close()).rejects.toThrow(
			/Failed to close plugins: 'first': boom-one, 'second': boom-two/,
		);
	});

	it("uses the default closeTimeout when omitted", () => {
		const manager = new PluginManager({ plugins: [] });
		expect((manager as any).closeTimeout).toBe(5000);
	});

	it("continues to later plugins when earlier callbacks return undefined", async () => {
		class SilentPlugin extends BasePlugin {
			calls = 0;
			constructor() {
				super("silent");
			}
			async onUserMessageCallback(): Promise<any> {
				this.calls += 1;
				return undefined;
			}
		}
		class LoudPlugin extends BasePlugin {
			calls = 0;
			constructor() {
				super("loud");
			}
			async onUserMessageCallback(): Promise<any> {
				this.calls += 1;
				return { rewritten: "hi" };
			}
		}
		const silent = new SilentPlugin();
		const loud = new LoudPlugin();
		const manager = new PluginManager({ plugins: [silent, loud] });

		await expect(
			manager.runOnUserMessageCallback({
				userMessage: { role: "user", parts: [{ text: "x" }] } as any,
				invocationContext: {} as any,
			}),
		).resolves.toEqual({ rewritten: "hi" });
		expect(silent.calls).toBe(1);
		expect(loud.calls).toBe(1);
	});

	it("exposes every pluginCallbackNameSchema enum value", () => {
		const values = pluginCallbackNameSchema.options;
		expect(values).toEqual(
			expect.arrayContaining([
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
			]),
		);
		expect(values).toHaveLength(12);
	});

	it("continues when a plugin has the callback method deleted", async () => {
		const stripped = new TestPlugin("stripped", { ignored: true });
		(stripped as { beforeRunCallback?: unknown }).beforeRunCallback = undefined;
		expect(stripped.beforeRunCallback).toBeUndefined();

		const answering = new TestPlugin("answering", { hit: true });
		const manager = new PluginManager({
			plugins: [stripped, answering],
		});

		await expect(
			manager.runBeforeRunCallback({ invocationContext: {} as any }),
		).resolves.toEqual({ hit: true });
		expect(answering.beforeRunCalls).toBe(1);
	});

	it("close skips plugins with deleted close among plugins that implement it", async () => {
		const close = vi.fn(async () => undefined);
		const withClose = new ClosePlugin("with-close", close);
		const withoutClose = new TestPlugin("without-close");
		(withoutClose as { close?: unknown }).close = undefined;
		expect(withoutClose.close).toBeUndefined();

		const manager = new PluginManager({
			plugins: [withoutClose, withClose],
			closeTimeout: 1000,
		});

		await expect(manager.close()).resolves.toBeUndefined();
		expect(close).toHaveBeenCalledOnce();
	});

	it("stringifies non-Error object throws in the wrapper message", async () => {
		class ObjectThrowPlugin extends BasePlugin {
			constructor() {
				super("object-throw");
			}
			async beforeRunCallback(): Promise<any> {
				throw { code: 42, reason: "nope" };
			}
		}
		const manager = new PluginManager({
			plugins: [new ObjectThrowPlugin()],
		});

		await expect(
			manager.runBeforeRunCallback({ invocationContext: {} as any }),
		).rejects.toThrow(
			/Error in plugin 'object-throw' during 'beforeRunCallback' callback: \[object Object\]/,
		);
	});
});
