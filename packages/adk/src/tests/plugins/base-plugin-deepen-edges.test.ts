import { describe, expect, it } from "vitest";
import { BasePlugin } from "../../plugins/base-plugin";

class NamedPlugin extends BasePlugin {
	constructor(name: string) {
		super(name);
	}
}

describe("BasePlugin deepen edges (TOKENMAXX remainder)", () => {
	it("preserves empty and unicode names", () => {
		expect(new NamedPlugin("").name).toBe("");
		expect(new NamedPlugin("插件-🚀").name).toBe("插件-🚀");
	});

	it("subclass can shadow a callback with undefined to skip it", async () => {
		class Shadowed extends BasePlugin {
			constructor() {
				super("shadowed");
			}
			beforeRunCallback = undefined;
		}
		const plugin = new Shadowed();
		expect(plugin.beforeRunCallback).toBeUndefined();
		expect(typeof plugin.afterRunCallback).toBe("function");
	});

	it("default afterRunCallback resolves void even with a result payload", async () => {
		const plugin = new NamedPlugin("after");
		await expect(
			plugin.afterRunCallback?.({
				invocationContext: {} as never,
				result: { ok: true },
			}),
		).resolves.toBeUndefined();
	});

	it("default error callbacks ignore the error and return undefined", async () => {
		const plugin = new NamedPlugin("errors");
		expect(
			await plugin.onModelErrorCallback?.({
				callbackContext: {} as never,
				llmRequest: {} as never,
				error: new Error("model"),
			}),
		).toBeUndefined();
		expect(
			await plugin.onToolErrorCallback?.({
				tool: {} as never,
				toolArgs: {},
				toolContext: {} as never,
				error: "tool-boom",
			}),
		).toBeUndefined();
	});

	it("allows subclass to return short-circuit values from before callbacks", async () => {
		class ShortCircuit extends BasePlugin {
			constructor() {
				super("short");
			}
			async beforeRunCallback() {
				return {
					author: "short",
					content: { parts: [{ text: "stop" }] },
				} as any;
			}
			async beforeToolCallback() {
				return { overridden: true };
			}
		}
		const plugin = new ShortCircuit();
		expect(await plugin.beforeRunCallback({} as never)).toMatchObject({
			author: "short",
		});
		expect(await plugin.beforeToolCallback({} as never)).toEqual({
			overridden: true,
		});
	});

	it("close can be overridden to perform cleanup", async () => {
		const closed: string[] = [];
		class Closing extends BasePlugin {
			constructor() {
				super("closing");
			}
			async close() {
				closed.push(this.name);
			}
		}
		await new Closing().close();
		expect(closed).toEqual(["closing"]);
	});
});
