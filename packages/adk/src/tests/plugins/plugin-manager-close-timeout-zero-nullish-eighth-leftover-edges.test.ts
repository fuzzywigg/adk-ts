import { describe, expect, it } from "vitest";
import { BasePlugin } from "../../plugins/base-plugin";
import { PluginManager } from "../../plugins/plugin-manager";

/**
 * Leftover: closeTimeout uses `??` — explicit 0 is kept (immediate timeout),
 * unlike `||` which would fall back to 5000.
 */
describe("plugin-manager closeTimeout zero nullish eighth leftover edges", () => {
	it("keeps closeTimeout: 0 via ?? (does not default to 5000)", () => {
		const manager = new PluginManager({ closeTimeout: 0 });
		expect((manager as any).closeTimeout).toBe(0);
	});

	it.each([
		{ label: "undefined opts", opts: undefined, expected: 5000 },
		{ label: "omitted closeTimeout", opts: {}, expected: 5000 },
		{
			label: "null closeTimeout",
			opts: { closeTimeout: null },
			expected: 5000,
		},
	] as const)("defaults to 5000 for nullish ($label)", ({ opts, expected }) => {
		const manager = new PluginManager(opts as any);
		expect((manager as any).closeTimeout).toBe(expected);
	});

	it("closeTimeout: 0 times out hanging plugin.close immediately", async () => {
		class HangingPlugin extends BasePlugin {
			async close(): Promise<void> {
				await new Promise(() => {});
			}
		}
		const manager = new PluginManager({
			plugins: [new HangingPlugin("hang")],
			closeTimeout: 0,
		});
		await expect(manager.close()).rejects.toThrow(/Failed to close plugins/);
	});

	it("closeTimeout: 1 still allows a fast close (control)", async () => {
		class FastPlugin extends BasePlugin {
			async close(): Promise<void> {}
		}
		const manager = new PluginManager({
			plugins: [new FastPlugin("fast")],
			closeTimeout: 1,
		});
		await expect(manager.close()).resolves.toBeUndefined();
	});
});
