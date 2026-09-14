import { describe, expect, it } from "vitest";
import { BasePlugin } from "../../plugins/base-plugin";
import { PluginManager } from "../../plugins/plugin-manager";

class SkipClosePlugin extends BasePlugin {
	closeCalls = 0;
}

class RealClosePlugin extends BasePlugin {
	closeCalls = 0;

	async close(): Promise<void> {
		this.closeCalls += 1;
	}
}

/**
 * Tenth leftover: `plugin.close?.bind(plugin)` — optional chaining skips only
 * null/undefined. Falsy non-nullish close (0/false/"") still evaluates
 * `.bind` and throws TypeError *before* the per-plugin try/catch, so close()
 * rejects with the raw TypeError instead of the aggregated failure bag.
 */
describe("plugin-manager close non-function falsy tenth leftover edges", () => {
	it("undefined close is skipped so later plugins still close", async () => {
		const skip = new SkipClosePlugin("skip");
		Object.defineProperty(skip, "close", { value: undefined });
		const next = new RealClosePlugin("next");
		const manager = new PluginManager({ plugins: [skip, next] });
		await expect(manager.close()).resolves.toBeUndefined();
		expect(next.closeCalls).toBe(1);
	});

	it.each([
		{ label: "0", value: 0 },
		{ label: "false", value: false },
		{ label: "empty string", value: "" },
	])("falsy non-nullish close ($label) throws TypeError before the failure bag", async ({
		value,
	}) => {
		const skip = new SkipClosePlugin("bad-close");
		Object.defineProperty(skip, "close", { value });
		const manager = new PluginManager({ plugins: [skip] });
		await expect(manager.close()).rejects.toThrow(/bind is not a function/);
	});

	it("null close is skipped like undefined", async () => {
		const skip = new SkipClosePlugin("null-close");
		Object.defineProperty(skip, "close", { value: null });
		const next = new RealClosePlugin("next");
		const manager = new PluginManager({ plugins: [skip, next] });
		await expect(manager.close()).resolves.toBeUndefined();
		expect(next.closeCalls).toBe(1);
	});
});
