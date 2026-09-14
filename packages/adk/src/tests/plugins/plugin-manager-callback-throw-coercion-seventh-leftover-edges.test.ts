import { describe, expect, it } from "vitest";
import { BasePlugin } from "../../plugins/base-plugin";
import { PluginManager } from "../../plugins/plugin-manager";

class ThrowValuePlugin extends BasePlugin {
	constructor(
		name: string,
		private readonly thrown: unknown,
	) {
		super(name);
	}

	async beforeRunCallback(): Promise<any> {
		throw this.thrown;
	}
}

class ThrowOnClosePlugin extends BasePlugin {
	constructor(
		name: string,
		private readonly thrown: unknown,
	) {
		super(name);
	}

	async close(): Promise<void> {
		throw this.thrown;
	}
}

describe("PluginManager callback throw coercion seventh leftover (post #158)", () => {
	it.each([
		{ label: "number", thrown: 7, expectedSnippet: "7" },
		{ label: "boolean-false", thrown: false, expectedSnippet: "false" },
		{ label: "boolean-true", thrown: true, expectedSnippet: "true" },
		{ label: "null", thrown: null, expectedSnippet: "null" },
		{ label: "undefined", thrown: undefined, expectedSnippet: "undefined" },
	] as const)("wraps non-Error callback throw ($label) via String(err)", async ({
		thrown,
		expectedSnippet,
	}) => {
		const manager = new PluginManager({
			plugins: [new ThrowValuePlugin("coercer", thrown)],
		});

		await expect(
			manager.runBeforeRunCallback({ invocationContext: {} as any }),
		).rejects.toThrow(
			`Error in plugin 'coercer' during 'beforeRunCallback' callback: ${expectedSnippet}`,
		);
	});

	it("still prefers Error.message over String(err) for Error throws", async () => {
		const manager = new PluginManager({
			plugins: [new ThrowValuePlugin("err", new Error("real-message"))],
		});

		await expect(
			manager.runBeforeRunCallback({ invocationContext: {} as any }),
		).rejects.toThrow(
			"Error in plugin 'err' during 'beforeRunCallback' callback: real-message",
		);
	});

	it.each([
		{ label: "number", thrown: 42, expectedSnippet: "42" },
		{ label: "boolean", thrown: false, expectedSnippet: "false" },
	] as const)("close() summary coerces non-Error close failures ($label)", async ({
		thrown,
		expectedSnippet,
	}) => {
		const manager = new PluginManager({
			plugins: [new ThrowOnClosePlugin("closer", thrown)],
		});

		await expect(manager.close()).rejects.toThrow(
			`Failed to close plugins: 'closer': ${expectedSnippet}`,
		);
	});
});
