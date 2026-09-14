import { describe, expect, it } from "vitest";
import { BasePlugin } from "../../plugins/base-plugin";
import { PluginManager } from "../../plugins/plugin-manager";

class NamedPlugin extends BasePlugin {}

/**
 * Leftover: registerPlugin/getPlugin use case-sensitive === — Foo and foo are
 * distinct plugins; getPlugin("FOO") misses.
 */
describe("plugin-manager name case-sensitivity ninth leftover edges", () => {
	it("allows Foo and foo as distinct registrations", () => {
		const manager = new PluginManager();
		const upper = new NamedPlugin("Foo");
		const lower = new NamedPlugin("foo");
		manager.registerPlugin(upper);
		manager.registerPlugin(lower);
		expect(manager.getPlugins()).toHaveLength(2);
		expect(manager.getPlugin("Foo")).toBe(upper);
		expect(manager.getPlugin("foo")).toBe(lower);
	});

	it("getPlugin misses differently-cased names", () => {
		const manager = new PluginManager({
			plugins: [new NamedPlugin("Foo")],
		});
		expect(manager.getPlugin("FOO")).toBeUndefined();
		expect(manager.getPlugin("foo")).toBeUndefined();
		expect(manager.getPlugin("Foo")?.name).toBe("Foo");
	});

	it("exact-case duplicate still throws (control)", () => {
		const manager = new PluginManager({
			plugins: [new NamedPlugin("Foo")],
		});
		expect(() => manager.registerPlugin(new NamedPlugin("Foo"))).toThrow(
			/already registered/,
		);
	});
});
