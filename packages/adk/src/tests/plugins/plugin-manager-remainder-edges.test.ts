import { describe, expect, it, vi } from "vitest";
import { BasePlugin } from "../../plugins/base-plugin";
import { PluginManager } from "../../plugins/plugin-manager";

class ClosePlugin extends BasePlugin {
	constructor(
		name: string,
		private readonly closeImpl: () => Promise<void>,
	) {
		super(name);
	}

	async close(): Promise<void> {
		await this.closeImpl();
	}
}

describe("PluginManager remainder edges (TOKENMAXX deepen)", () => {
	it("stringifies non-Error close failures in the aggregate message", async () => {
		const manager = new PluginManager({
			plugins: [
				new ClosePlugin("str-fail", async () => {
					throw "close-string-boom";
				}),
				new ClosePlugin("num-fail", async () => {
					throw 404;
				}),
			],
			closeTimeout: 1000,
		});

		await expect(manager.close()).rejects.toThrow(
			/Failed to close plugins: 'str-fail': close-string-boom, 'num-fail': 404/,
		);
	});

	it("early-exits when the second plugin returns a value after the first returns undefined", async () => {
		class First extends BasePlugin {
			hits = 0;
			constructor() {
				super("first");
			}
			async beforeRunCallback() {
				this.hits += 1;
				return undefined;
			}
		}
		class Second extends BasePlugin {
			hits = 0;
			constructor() {
				super("second");
			}
			async beforeRunCallback() {
				this.hits += 1;
				return { author: "second" } as any;
			}
		}
		class Third extends BasePlugin {
			hits = 0;
			constructor() {
				super("third");
			}
			async beforeRunCallback() {
				this.hits += 1;
				return { author: "third" } as any;
			}
		}

		const first = new First();
		const second = new Second();
		const third = new Third();
		const manager = new PluginManager({ plugins: [first, second, third] });

		const result = await manager.runBeforeRunCallback({
			invocationContext: {} as any,
		});

		expect(result).toMatchObject({ author: "second" });
		expect(first.hits).toBe(1);
		expect(second.hits).toBe(1);
		expect(third.hits).toBe(0);
	});

	it("wraps Error onEventCallback failures with plugin and callback names", async () => {
		class Boom extends BasePlugin {
			constructor() {
				super("boom-plugin");
			}
			async onEventCallback() {
				throw new Error("event-failed");
			}
		}
		const manager = new PluginManager({ plugins: [new Boom()] });
		await expect(
			manager.runOnEventCallback({
				invocationContext: {} as any,
				event: {} as any,
			}),
		).rejects.toThrow(
			"Error in plugin 'boom-plugin' during 'onEventCallback' callback: event-failed",
		);
	});

	it("returns undefined when every afterAgentCallback returns undefined", async () => {
		class Quiet extends BasePlugin {
			constructor(name: string) {
				super(name);
			}
			async afterAgentCallback() {
				return undefined;
			}
		}
		const manager = new PluginManager({
			plugins: [new Quiet("a"), new Quiet("b")],
		});
		await expect(
			manager.runAfterAgentCallback({
				agent: {} as any,
				callbackContext: {} as any,
			}),
		).resolves.toBeUndefined();
	});

	it("close succeeds when a later plugin closes after an earlier missing close", async () => {
		const closed = vi.fn(async () => undefined);
		const manager = new PluginManager({
			plugins: [
				{ name: "duck-no-close" } as any,
				new ClosePlugin("real", closed),
			],
			closeTimeout: 1000,
		});
		await expect(manager.close()).resolves.toBeUndefined();
		expect(closed).toHaveBeenCalledOnce();
	});

	it("stringifies non-Error throws from beforeToolCallback", async () => {
		class StringToolBoom extends BasePlugin {
			constructor() {
				super("tool-str");
			}
			async beforeToolCallback() {
				throw { code: "E_TOOL" };
			}
		}
		const manager = new PluginManager({ plugins: [new StringToolBoom()] });
		await expect(
			manager.runBeforeToolCallback({
				tool: {} as any,
				toolArgs: {},
				toolContext: {} as any,
			}),
		).rejects.toThrow(
			/Error in plugin 'tool-str' during 'beforeToolCallback' callback: \[object Object\]/,
		);
	});
});
