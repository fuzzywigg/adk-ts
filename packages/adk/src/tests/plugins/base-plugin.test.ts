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
});
