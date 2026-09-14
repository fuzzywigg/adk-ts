import { describe, expect, it } from "vitest";
import * as plugins from "../../plugins";

describe("plugins barrel exports", () => {
	it("exposes BasePlugin and PluginManager", () => {
		expect(plugins.BasePlugin).toBeTypeOf("function");
		expect(plugins.PluginManager).toBeTypeOf("function");
		expect(plugins.pluginCallbackNameSchema).toBeDefined();
	});

	it("exposes LangfusePlugin", () => {
		expect(plugins.LangfusePlugin).toBeTypeOf("function");
	});

	it("exposes ReflectAndRetryToolPlugin and constants", () => {
		expect(plugins.ReflectAndRetryToolPlugin).toBeTypeOf("function");
		expect(plugins.REFLECT_AND_RETRY_RESPONSE_TYPE).toBeTypeOf("string");
	});
});
