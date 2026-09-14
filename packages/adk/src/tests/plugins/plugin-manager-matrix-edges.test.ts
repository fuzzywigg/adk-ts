import { describe, expect, it, vi } from "vitest";
import { BasePlugin } from "../../plugins/base-plugin";
import { PluginManager } from "../../plugins/plugin-manager";

describe("PluginManager matrix edges (TOKENMAXX leftovers)", () => {
	it.each([
		{
			label: "undefined own callback",
			install: (plugin: BasePlugin) => {
				(plugin as any).beforeRunCallback = undefined;
			},
		},
		{
			label: "null own callback",
			install: (plugin: BasePlugin) => {
				(plugin as any).beforeRunCallback = null;
			},
		},
		{
			label: "deleted own callback shadowing prototype",
			install: (plugin: BasePlugin) => {
				(plugin as any).beforeRunCallback = undefined;
				delete (plugin as any).beforeRunCallback;
				Object.defineProperty(plugin, "beforeRunCallback", {
					value: undefined,
					configurable: true,
				});
			},
		},
	])("runCallbacks continues when plugin.$label is missing", async ({
		install,
	}) => {
		class Silent extends BasePlugin {
			constructor() {
				super("silent");
			}
		}
		class Loud extends BasePlugin {
			constructor() {
				super("loud");
			}
			async beforeRunCallback(): Promise<any> {
				return { ok: true };
			}
		}

		const silent = new Silent();
		install(silent);
		const manager = new PluginManager({
			plugins: [silent, new Loud()],
		});

		await expect(
			manager.runBeforeRunCallback({ invocationContext: {} as any }),
		).resolves.toEqual({ ok: true });
	});

	it.each([
		{
			label: "undefined close",
			install: (plugin: BasePlugin) => {
				(plugin as any).close = undefined;
			},
		},
		{
			label: "null close",
			install: (plugin: BasePlugin) => {
				(plugin as any).close = null;
			},
		},
		{
			label: "deleted close property",
			install: (plugin: BasePlugin) => {
				Object.defineProperty(plugin, "close", {
					value: undefined,
					configurable: true,
				});
			},
		},
	])("close continues when plugin.$label is missing", async ({ install }) => {
		const closed = vi.fn(async () => undefined);
		class Closing extends BasePlugin {
			async close(): Promise<void> {
				await closed();
			}
		}
		class MissingClose extends BasePlugin {
			constructor() {
				super("missing-close");
			}
		}

		const missing = new MissingClose();
		install(missing);
		const closing = new Closing("ok");
		const manager = new PluginManager({
			plugins: [missing, closing],
			closeTimeout: 1000,
		});

		await expect(manager.close()).resolves.toBeUndefined();
		expect(closed).toHaveBeenCalledTimes(1);
	});
});
