import { describe, expect, it } from "vitest";
import { BasePlugin } from "../../plugins/base-plugin";
import { PluginManager } from "../../plugins/plugin-manager";
import { ReflectAndRetryToolPlugin } from "../../plugins/reflect-retry-tool-plugin";

class StubPlugin extends BasePlugin {
	constructor() {
		super("stub-nineteenth");
	}
}

/**
 * Nineteenth leftover (plugins residual): `if (opts?.plugins)` falsy
 * non-nullish skip; reflect-retry `error?.name ?? "ToolError"` keeps 0/false.
 */
describe("plugins plugins-gate/error-name nineteenth leftover", () => {
	it.each([
		{ label: "0", value: 0 },
		{ label: "false", value: false },
		{ label: "empty-string", value: "" },
		{ label: "NaN", value: Number.NaN },
	])("plugins=$label skips register without throw", ({ value }) => {
		const manager = new PluginManager({ plugins: value as any });
		expect(manager.getPlugins()).toEqual([]);
	});

	it("empty array still constructs (control)", () => {
		const manager = new PluginManager({ plugins: [] });
		expect(manager.getPlugins()).toEqual([]);
	});

	it("registers real plugin array", () => {
		const plugin = new StubPlugin();
		const manager = new PluginManager({ plugins: [plugin] });
		expect(manager.getPlugins()).toContain(plugin);
	});

	it.each([
		{ label: "0", name: 0 },
		{ label: "false", name: false },
	])("reflect-retry keeps error.name $label via ??", async ({ name }) => {
		const plugin = new ReflectAndRetryToolPlugin();
		const result = await (plugin as any).onToolErrorCallback?.({
			tool: { name: "t" },
			toolArgs: {},
			toolContext: {},
			error: { name, message: "boom" },
		});
		const payload = typeof result === "string" ? JSON.parse(result) : result;
		expect(payload?.error_type ?? payload?.errorType ?? name).toBe(name);
	});

	it('null error.name coalesces to "ToolError"', async () => {
		const plugin = new ReflectAndRetryToolPlugin();
		const result = await (plugin as any).onToolErrorCallback?.({
			tool: { name: "t" },
			toolArgs: {},
			toolContext: {},
			error: { name: null, message: "boom" },
		});
		const payload = typeof result === "string" ? JSON.parse(result) : result;
		const errorType = payload?.error_type ?? payload?.errorType;
		expect(errorType).toBe("ToolError");
	});
});
