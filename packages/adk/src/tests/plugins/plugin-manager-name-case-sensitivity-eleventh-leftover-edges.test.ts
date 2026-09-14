import { describe, expect, it } from "vitest";
import { BasePlugin } from "../../plugins/base-plugin";
import { PluginManager } from "../../plugins/plugin-manager";

/**
 * Eleventh leftover: registerPlugin / getPlugin use case-sensitive `===` on
 * name — "Foo" and "foo" are distinct; getPlugin("FOO") misses "foo".
 */
describe("plugin-manager name case-sensitivity eleventh leftover edges", () => {
	class NamedPlugin extends BasePlugin {}

	it("allows Foo and foo as distinct plugins (case-sensitive uniqueness)", () => {
		const manager = new PluginManager();
		manager.registerPlugin(new NamedPlugin("Foo"));
		expect(() => manager.registerPlugin(new NamedPlugin("foo"))).not.toThrow();
		expect(manager.getPlugins()).toHaveLength(2);
		expect(manager.getPlugin("Foo")?.name).toBe("Foo");
		expect(manager.getPlugin("foo")?.name).toBe("foo");
	});

	it.each([
		"FOO",
		"Foo",
		"fOo",
	])('getPlugin(%j) misses exact lowercase "foo"', (query) => {
		const manager = new PluginManager({
			plugins: [new NamedPlugin("foo")],
		});
		expect(manager.getPlugin(query)).toBeUndefined();
		expect(manager.getPlugin("foo")?.name).toBe("foo");
	});

	it("duplicate check is case-sensitive — exact rematch still throws", () => {
		const manager = new PluginManager({
			plugins: [new NamedPlugin("Alpha")],
		});
		expect(() =>
			manager.registerPlugin(new NamedPlugin("alpha")),
		).not.toThrow();
		expect(() => manager.registerPlugin(new NamedPlugin("Alpha"))).toThrow(
			/Plugin with name 'Alpha' already registered/,
		);
	});
});
