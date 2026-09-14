import { describe, expect, it } from "vitest";
import { BasePlugin } from "../../plugins/base-plugin";

class ConcretePlugin extends BasePlugin {
	constructor(name = "concrete") {
		super(name);
	}
}

describe("BasePlugin", () => {
	it("stores the plugin name", () => {
		const plugin = new ConcretePlugin("my-plugin");
		expect(plugin.name).toBe("my-plugin");
	});

	it("default callbacks resolve to undefined or void", async () => {
		const plugin = new ConcretePlugin();
		const params = {} as never;

		expect(await plugin.onUserMessageCallback?.(params)).toBeUndefined();
		expect(await plugin.beforeRunCallback?.(params)).toBeUndefined();
		expect(await plugin.onEventCallback?.(params)).toBeUndefined();
		expect(await plugin.afterRunCallback?.(params)).toBeUndefined();
		expect(await plugin.close?.()).toBeUndefined();
		expect(await plugin.beforeAgentCallback?.(params)).toBeUndefined();
		expect(await plugin.afterAgentCallback?.(params)).toBeUndefined();
		expect(await plugin.beforeModelCallback?.(params)).toBeUndefined();
		expect(await plugin.afterModelCallback?.(params)).toBeUndefined();
		expect(await plugin.onModelErrorCallback?.(params)).toBeUndefined();
		expect(await plugin.beforeToolCallback?.(params)).toBeUndefined();
		expect(await plugin.afterToolCallback?.(params)).toBeUndefined();
		expect(await plugin.onToolErrorCallback?.(params)).toBeUndefined();
	});

	it("allows subclasses to override individual callbacks", async () => {
		class CountingPlugin extends BasePlugin {
			hits = 0;
			constructor() {
				super("counting");
			}
			async beforeRunCallback() {
				this.hits += 1;
				return undefined;
			}
			async afterRunCallback() {
				this.hits += 1;
			}
		}

		const plugin = new CountingPlugin();
		await plugin.beforeRunCallback({} as never);
		await plugin.afterRunCallback({} as never);
		expect(plugin.hits).toBe(2);
		expect(plugin.name).toBe("counting");
	});

	it("allows subclasses to override hooks and return values", async () => {
		class ReturningPlugin extends BasePlugin {
			closed = false;
			constructor() {
				super("returning");
			}
			async onUserMessageCallback() {
				return { role: "user", parts: [{ text: "rewritten" }] } as any;
			}
			async beforeRunCallback() {
				return { id: "evt-1" } as any;
			}
			async onEventCallback() {
				return { id: "evt-2" } as any;
			}
			async beforeAgentCallback() {
				return { role: "model", parts: [{ text: "agent" }] } as any;
			}
			async afterAgentCallback() {
				return { role: "model", parts: [{ text: "after-agent" }] } as any;
			}
			async beforeModelCallback() {
				return { text: "cached" } as any;
			}
			async afterModelCallback() {
				return { text: "patched" } as any;
			}
			async onModelErrorCallback() {
				return { text: "model-fallback" } as any;
			}
			async beforeToolCallback() {
				return { shortCircuit: true };
			}
			async afterToolCallback() {
				return { rewritten: true };
			}
			async onToolErrorCallback() {
				return { recovered: true };
			}
			async close() {
				this.closed = true;
			}
		}

		const plugin = new ReturningPlugin();
		const params = {} as never;

		expect(await plugin.onUserMessageCallback(params)).toEqual({
			role: "user",
			parts: [{ text: "rewritten" }],
		});
		expect(await plugin.beforeRunCallback(params)).toEqual({ id: "evt-1" });
		expect(await plugin.onEventCallback(params)).toEqual({ id: "evt-2" });
		expect(await plugin.beforeAgentCallback(params)).toEqual({
			role: "model",
			parts: [{ text: "agent" }],
		});
		expect(await plugin.afterAgentCallback(params)).toEqual({
			role: "model",
			parts: [{ text: "after-agent" }],
		});
		expect(await plugin.beforeModelCallback(params)).toEqual({
			text: "cached",
		});
		expect(await plugin.afterModelCallback(params)).toEqual({
			text: "patched",
		});
		expect(await plugin.onModelErrorCallback(params)).toEqual({
			text: "model-fallback",
		});
		expect(await plugin.beforeToolCallback(params)).toEqual({
			shortCircuit: true,
		});
		expect(await plugin.afterToolCallback(params)).toEqual({
			rewritten: true,
		});
		expect(await plugin.onToolErrorCallback(params)).toEqual({
			recovered: true,
		});

		await plugin.close();
		expect(plugin.closed).toBe(true);
	});

	it("default afterRunCallback and close resolve without returning a value", async () => {
		const plugin = new ConcretePlugin("lifecycle");
		await expect(
			plugin.afterRunCallback?.({} as never),
		).resolves.toBeUndefined();
		await expect(plugin.close?.()).resolves.toBeUndefined();
	});
});
