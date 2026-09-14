import { describe, expect, it, vi } from "vitest";
import { BasePlugin } from "../../plugins/base-plugin";
import {
	PluginManager,
	pluginCallbackNameSchema,
} from "../../plugins/plugin-manager";

class NamedPlugin extends BasePlugin {
	constructor(name: string) {
		super(name);
	}
}

class ReturningBeforeRunPlugin extends BasePlugin {
	calls = 0;

	constructor(
		name: string,
		private readonly value: unknown,
	) {
		super(name);
	}

	async beforeRunCallback(): Promise<any> {
		this.calls += 1;
		return this.value;
	}
}

class ReturningAfterRunPlugin extends BasePlugin {
	calls = 0;

	constructor(
		name: string,
		private readonly value: unknown,
	) {
		super(name);
	}

	async afterRunCallback(): Promise<any> {
		this.calls += 1;
		return this.value;
	}
}

class CloseTrackingPlugin extends BasePlugin {
	closeCalls = 0;

	constructor(name: string) {
		super(name);
	}

	async close(): Promise<void> {
		this.closeCalls += 1;
	}
}

describe("PluginManager leftover edges", () => {
	it("continues when beforeRunCallback is shadowed with undefined", async () => {
		const skip = new NamedPlugin("skip-before");
		Object.defineProperty(skip, "beforeRunCallback", { value: undefined });
		const next = new ReturningBeforeRunPlugin("hit-before", { ok: true });
		const manager = new PluginManager({ plugins: [skip, next] });

		await expect(
			manager.runBeforeRunCallback({ invocationContext: {} as any }),
		).resolves.toEqual({ ok: true });
		expect(next.calls).toBe(1);
	});

	it("continues when afterRunCallback is shadowed with undefined via runCallbacks", async () => {
		const skip = new NamedPlugin("skip-after");
		Object.defineProperty(skip, "afterRunCallback", { value: undefined });
		const next = new ReturningAfterRunPlugin("hit-after", { done: 1 });
		const manager = new PluginManager({ plugins: [skip, next] });

		await expect(
			manager.runAfterRunCallback({ invocationContext: {} as any }),
		).resolves.toEqual({ done: 1 });
		expect(next.calls).toBe(1);
	});

	it("skips close when close is undefined or null on the instance", async () => {
		const undefinedClose = new CloseTrackingPlugin("undef-close");
		Object.defineProperty(undefinedClose, "close", { value: undefined });

		const nullClose = new CloseTrackingPlugin("null-close");
		Object.defineProperty(nullClose, "close", { value: null });

		const ok = new CloseTrackingPlugin("ok-close");
		const manager = new PluginManager({
			plugins: [undefinedClose, nullClose, ok],
			closeTimeout: 1000,
		});

		await expect(manager.close()).resolves.toBeUndefined();
		expect(undefinedClose.closeCalls).toBe(0);
		expect(nullClose.closeCalls).toBe(0);
		expect(ok.closeCalls).toBe(1);
	});

	it("mixes a plugin without method then one that returns a value", async () => {
		const bare = new NamedPlugin("bare");
		Object.defineProperty(bare, "beforeRunCallback", { value: undefined });
		const returning = new ReturningBeforeRunPlugin("returning", {
			stopped: true,
		});
		const ignored = new ReturningBeforeRunPlugin("ignored", { nope: true });
		const manager = new PluginManager({
			plugins: [bare, returning, ignored],
		});

		const result = await manager.runBeforeRunCallback({
			invocationContext: {} as any,
		});
		expect(result).toEqual({ stopped: true });
		expect(returning.calls).toBe(1);
		expect(ignored.calls).toBe(0);
	});

	it.each(
		pluginCallbackNameSchema.options,
	)("continues when %s is omitted via undefined own property", async (callbackName) => {
		const plugin = new NamedPlugin(`omit-${callbackName}`);
		Object.defineProperty(plugin, callbackName, {
			value: undefined,
			configurable: true,
		});
		const manager = new PluginManager({ plugins: [plugin] });

		const runners: Record<string, () => Promise<unknown>> = {
			onUserMessageCallback: () =>
				manager.runOnUserMessageCallback({
					userMessage: { role: "user", parts: [{ text: "x" }] } as any,
					invocationContext: {} as any,
				}),
			beforeRunCallback: () =>
				manager.runBeforeRunCallback({ invocationContext: {} as any }),
			afterRunCallback: () =>
				manager.runAfterRunCallback({ invocationContext: {} as any }),
			onEventCallback: () =>
				manager.runOnEventCallback({
					invocationContext: {} as any,
					event: {} as any,
				}),
			beforeAgentCallback: () =>
				manager.runBeforeAgentCallback({
					agent: {} as any,
					callbackContext: {} as any,
				}),
			afterAgentCallback: () =>
				manager.runAfterAgentCallback({
					agent: {} as any,
					callbackContext: {} as any,
				}),
			beforeToolCallback: () =>
				manager.runBeforeToolCallback({
					tool: {} as any,
					toolArgs: {},
					toolContext: {} as any,
				}),
			afterToolCallback: () =>
				manager.runAfterToolCallback({
					tool: {} as any,
					toolArgs: {},
					toolContext: {} as any,
					result: {},
				}),
			beforeModelCallback: () =>
				manager.runBeforeModelCallback({
					callbackContext: {} as any,
					llmRequest: {} as any,
				}),
			afterModelCallback: () =>
				manager.runAfterModelCallback({
					callbackContext: {} as any,
					llmResponse: {} as any,
				}),
			onToolErrorCallback: () =>
				manager.runOnToolErrorCallback({
					tool: {} as any,
					toolArgs: {},
					toolContext: {} as any,
					error: new Error("e"),
				}),
			onModelErrorCallback: () =>
				manager.runOnModelErrorCallback({
					callbackContext: {} as any,
					llmRequest: {} as any,
					error: new Error("e"),
				}),
		};

		await expect(runners[callbackName]()).resolves.toBeUndefined();
	});

	it("delete after own-property shadow still leaves manager continuing", async () => {
		const plugin = new NamedPlugin("delete-before");
		Object.defineProperty(plugin, "beforeRunCallback", {
			value: vi.fn(),
			configurable: true,
			writable: true,
		});
		delete (plugin as any).beforeRunCallback;
		// Prototype method remains unless shadowed; force skip with undefined.
		Object.defineProperty(plugin, "beforeRunCallback", { value: undefined });

		const next = new ReturningBeforeRunPlugin("after-delete", { v: 2 });
		const manager = new PluginManager({ plugins: [plugin, next] });

		await expect(
			manager.runBeforeRunCallback({ invocationContext: {} as any }),
		).resolves.toEqual({ v: 2 });
	});
});
