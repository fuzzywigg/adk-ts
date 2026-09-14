import { describe, expect, it } from "vitest";
import {
	BasePlugin,
	LangfusePlugin,
	PluginManager,
	REFLECT_AND_RETRY_RESPONSE_TYPE,
	ReflectAndRetryToolPlugin,
	pluginCallbackNameSchema,
} from "../../plugins";

describe("plugins barrel exports", () => {
	it("re-exports core plugin classes and constants", () => {
		expect(BasePlugin).toBeTypeOf("function");
		expect(LangfusePlugin).toBeTypeOf("function");
		expect(PluginManager).toBeTypeOf("function");
		expect(ReflectAndRetryToolPlugin).toBeTypeOf("function");
		expect(pluginCallbackNameSchema.options.length).toBeGreaterThan(0);
		expect(REFLECT_AND_RETRY_RESPONSE_TYPE).toContain("REFLECT");
	});

	it("constructs PluginManager and ReflectAndRetryToolPlugin from barrel", () => {
		const plugin = new ReflectAndRetryToolPlugin({ name: "from-barrel" });
		const manager = new PluginManager({ plugins: [plugin] });
		expect(manager.getPlugin("from-barrel")).toBe(plugin);
	});
});
