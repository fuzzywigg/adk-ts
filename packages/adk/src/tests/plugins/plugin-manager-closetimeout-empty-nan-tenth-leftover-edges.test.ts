import { describe, expect, it } from "vitest";
import { BasePlugin } from "../../plugins/base-plugin";
import { PluginManager } from "../../plugins/plugin-manager";

/**
 * Tenth leftover: closeTimeout uses `??` — eighth leftover covers 0/nullish;
 * empty string and NaN are kept (not 5000) and coerce setTimeout to an
 * immediate timeout.
 */
describe("plugin-manager closeTimeout empty-string/NaN tenth leftover edges", () => {
	it('keeps closeTimeout: "" via ?? (does not default to 5000)', () => {
		const manager = new PluginManager({ closeTimeout: "" as any });
		expect((manager as any).closeTimeout).toBe("");
	});

	it("keeps closeTimeout: NaN via ?? (does not default to 5000)", () => {
		const manager = new PluginManager({ closeTimeout: Number.NaN });
		expect(Number.isNaN((manager as any).closeTimeout)).toBe(true);
	});

	it("false is kept via ?? (not 5000) unlike ||", () => {
		const manager = new PluginManager({ closeTimeout: false as any });
		expect((manager as any).closeTimeout).toBe(false);
	});

	it('closeTimeout: "" times out a hanging close', async () => {
		class HangPlugin extends BasePlugin {
			async close(): Promise<void> {
				await new Promise(() => {});
			}
		}
		const manager = new PluginManager({
			plugins: [new HangPlugin("hang")],
			closeTimeout: "" as any,
		});
		await expect(manager.close()).rejects.toThrow(/Failed to close plugins/);
	});

	it("closeTimeout: NaN times out a hanging close", async () => {
		class HangPlugin extends BasePlugin {
			async close(): Promise<void> {
				await new Promise(() => {});
			}
		}
		const manager = new PluginManager({
			plugins: [new HangPlugin("hang-nan")],
			closeTimeout: Number.NaN,
		});
		await expect(manager.close()).rejects.toThrow(/Failed to close plugins/);
	});
});
