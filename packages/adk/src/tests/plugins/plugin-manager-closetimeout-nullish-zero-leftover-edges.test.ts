import { describe, expect, it, vi } from "vitest";
import { BasePlugin } from "../../plugins/base-plugin";
import { PluginManager } from "../../plugins/plugin-manager";

class CloseTrackingPlugin extends BasePlugin {
	closed = 0;

	constructor(name: string) {
		super(name);
	}

	async close(): Promise<void> {
		this.closed += 1;
	}
}

describe("PluginManager closeTimeout ?? leftover (post #168)", () => {
	it("closeTimeout: 0 is kept via ?? (not coalesced to 5000)", () => {
		const manager = new PluginManager({ closeTimeout: 0 });
		expect((manager as any).closeTimeout).toBe(0);
	});

	it.each([
		{ label: "undefined opts", opts: undefined },
		{ label: "omitted closeTimeout", opts: { plugins: [] } },
		{ label: "explicit undefined", opts: { closeTimeout: undefined } },
	])("$label defaults closeTimeout to 5000", ({ opts }) => {
		const manager = new PluginManager(opts as any);
		expect((manager as any).closeTimeout).toBe(5000);
	});

	it("closeTimeout: 0 still runs close() on plugins (nullish only)", async () => {
		vi.useFakeTimers();
		const plugin = new CloseTrackingPlugin("p0");
		const manager = new PluginManager({
			plugins: [plugin],
			closeTimeout: 0,
		});

		const closePromise = manager.close();
		await vi.advanceTimersByTimeAsync(0);
		await closePromise;

		expect(plugin.closed).toBe(1);
		vi.useRealTimers();
	});

	it("positive closeTimeout override is preserved", () => {
		const manager = new PluginManager({ closeTimeout: 42 });
		expect((manager as any).closeTimeout).toBe(42);
	});
});
