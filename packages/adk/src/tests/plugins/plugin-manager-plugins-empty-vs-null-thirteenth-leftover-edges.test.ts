import { describe, expect, it } from "vitest";
import { BasePlugin } from "../../plugins/base-plugin";
import { PluginManager } from "../../plugins/plugin-manager";

class NamedPlugin extends BasePlugin {
	constructor(name: string) {
		super(name);
	}
}

/**
 * Thirteenth leftover: constructor `if (opts?.plugins)` — [] is truthy and
 * iterates (no-op); null/undefined skip registration.
 */
describe("plugin-manager plugins empty vs null thirteenth leftover", () => {
	it("omitted opts does not throw and has no plugins", () => {
		expect(new PluginManager().getPlugins()).toEqual([]);
	});

	it("plugins: undefined skips the register loop", () => {
		expect(new PluginManager({ plugins: undefined }).getPlugins()).toEqual([]);
	});

	it("plugins: [] is truthy and iterates zero times", () => {
		expect(new PluginManager({ plugins: [] }).getPlugins()).toEqual([]);
	});

	it("plugins: null is falsy for opts?.plugins and skips registration", () => {
		expect(new PluginManager({ plugins: null as any }).getPlugins()).toEqual(
			[],
		);
	});

	it("registers unique plugins (control)", () => {
		const manager = new PluginManager({
			plugins: [new NamedPlugin("a"), new NamedPlugin("b")],
		});
		expect(manager.getPlugins().map((p) => p.name)).toEqual(["a", "b"]);
	});
});
