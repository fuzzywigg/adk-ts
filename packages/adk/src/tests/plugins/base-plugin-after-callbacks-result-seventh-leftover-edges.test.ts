import { describe, expect, it } from "vitest";
import { BasePlugin } from "../../plugins/base-plugin";

class ConcretePlugin extends BasePlugin {
	constructor() {
		super("concrete");
	}
}

describe("BasePlugin after-callback defaults ignore result seventh leftover (post #158)", () => {
	it("afterAgentCallback default returns undefined even with result payload", async () => {
		const plugin = new ConcretePlugin();
		await expect(
			plugin.afterAgentCallback!({
				agent: {} as any,
				callbackContext: {} as any,
				result: { content: { parts: [{ text: "hi" }] } },
			}),
		).resolves.toBeUndefined();
	});

	it("afterModelCallback default returns undefined even with llmResponse", async () => {
		const plugin = new ConcretePlugin();
		await expect(
			plugin.afterModelCallback!({
				callbackContext: {} as any,
				llmResponse: { text: "out" } as any,
				llmRequest: { model: "m" } as any,
			}),
		).resolves.toBeUndefined();
	});

	it("afterToolCallback default returns undefined even with result", async () => {
		const plugin = new ConcretePlugin();
		await expect(
			plugin.afterToolCallback!({
				tool: { name: "t" } as any,
				toolArgs: { a: 1 },
				toolContext: {} as any,
				result: { ok: true },
			}),
		).resolves.toBeUndefined();
	});

	it("afterRunCallback default resolves void with result payload", async () => {
		const plugin = new ConcretePlugin();
		await expect(
			plugin.afterRunCallback!({
				invocationContext: {} as any,
				result: "payload",
			}),
		).resolves.toBeUndefined();
	});
});
