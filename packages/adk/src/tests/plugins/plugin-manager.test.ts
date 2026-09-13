import { describe, expect, it, vi } from "vitest";
import { BasePlugin } from "../../plugins/base-plugin";
import { PluginManager } from "../../plugins/plugin-manager";

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
});
