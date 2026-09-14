import { describe, expect, it } from "vitest";
import { BasePlugin } from "../../plugins/base-plugin";
import { PluginManager } from "../../plugins/plugin-manager";

class NamedPlugin extends BasePlugin {
	constructor(name: string) {
		super(name);
	}
}

class InstantClosePlugin extends BasePlugin {
	closed = false;

	constructor(name: string) {
		super(name);
	}

	async close(): Promise<void> {
		this.closed = true;
	}
}

describe("PluginManager constructor + closeTimeout 0 seventh leftover (post #158)", () => {
	it("constructor throws when opts.plugins contains duplicate names", () => {
		expect(
			() =>
				new PluginManager({
					plugins: [new NamedPlugin("dup"), new NamedPlugin("dup")],
				}),
		).toThrow("Plugin with name 'dup' already registered.");
	});

	it("constructor registers distinct plugins from opts.plugins in order", () => {
		const a = new NamedPlugin("a");
		const b = new NamedPlugin("b");
		const manager = new PluginManager({ plugins: [a, b] });
		expect(manager.getPlugins().map((p) => p.name)).toEqual(["a", "b"]);
	});

	it("closeTimeout: 0 is kept by ?? (not defaulted to 5000) and times out hanging close", async () => {
		class HangClosePlugin extends BasePlugin {
			async close(): Promise<void> {
				return new Promise(() => {});
			}
		}
		const hang = new HangClosePlugin("slow");
		const manager = new PluginManager({
			plugins: [hang],
			closeTimeout: 0,
		});
		expect((manager as any).closeTimeout).toBe(0);

		await expect(manager.close()).rejects.toThrow(
			"Failed to close plugins: 'slow': close() timeout",
		);
	});

	it("closeTimeout: 0 still allows already-resolved close() to succeed", async () => {
		const instant = new InstantClosePlugin("instant");
		const manager = new PluginManager({
			plugins: [instant],
			closeTimeout: 0,
		});
		await expect(manager.close()).resolves.toBeUndefined();
		expect(instant.closed).toBe(true);
	});
});
