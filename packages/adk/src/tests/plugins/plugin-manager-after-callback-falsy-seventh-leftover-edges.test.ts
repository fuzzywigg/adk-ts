import { describe, expect, it } from "vitest";
import { BasePlugin } from "../../plugins/base-plugin";
import { PluginManager } from "../../plugins/plugin-manager";

class FalsyReturnPlugin extends BasePlugin {
	calls = 0;

	constructor(
		name: string,
		private readonly method: string,
		private readonly value: unknown,
	) {
		super(name);
	}

	async afterModelCallback(): Promise<any> {
		if (this.method !== "afterModel") return undefined;
		this.calls += 1;
		return this.value;
	}

	async afterAgentCallback(): Promise<any> {
		if (this.method !== "afterAgent") return undefined;
		this.calls += 1;
		return this.value;
	}

	async afterToolCallback(): Promise<any> {
		if (this.method !== "afterTool") return undefined;
		this.calls += 1;
		return this.value;
	}

	async onEventCallback(): Promise<any> {
		if (this.method !== "onEvent") return undefined;
		this.calls += 1;
		return this.value;
	}

	async onToolErrorCallback(): Promise<any> {
		if (this.method !== "onToolError") return undefined;
		this.calls += 1;
		return this.value;
	}

	async onModelErrorCallback(): Promise<any> {
		if (this.method !== "onModelError") return undefined;
		this.calls += 1;
		return this.value;
	}
}

const falsyCases = [
	{ label: "null", value: null },
	{ label: "0", value: 0 },
	{ label: "empty-string", value: "" },
	{ label: "false", value: false },
] as const;

describe("PluginManager after/error falsy early-exit seventh leftover (post #158)", () => {
	it.each(
		falsyCases,
	)("runAfterModelCallback early-exits on defined falsy ($label)", async ({
		value,
	}) => {
		const first = new FalsyReturnPlugin("first", "afterModel", value);
		const second = new FalsyReturnPlugin("second", "afterModel", {
			should: "not-run",
		});
		const manager = new PluginManager({ plugins: [first, second] });

		await expect(
			manager.runAfterModelCallback({
				callbackContext: {} as any,
				llmResponse: {} as any,
			}),
		).resolves.toBe(value);
		expect(first.calls).toBe(1);
		expect(second.calls).toBe(0);
	});

	it.each(
		falsyCases,
	)("runAfterAgentCallback early-exits on defined falsy ($label)", async ({
		value,
	}) => {
		const first = new FalsyReturnPlugin("first-agent", "afterAgent", value);
		const second = new FalsyReturnPlugin("second-agent", "afterAgent", {
			hit: true,
		});
		const manager = new PluginManager({ plugins: [first, second] });

		await expect(
			manager.runAfterAgentCallback({
				agent: {} as any,
				callbackContext: {} as any,
			}),
		).resolves.toBe(value);
		expect(first.calls).toBe(1);
		expect(second.calls).toBe(0);
	});

	it.each([
		{ label: "null", value: null },
		{ label: "false", value: false },
	] as const)("runAfterToolCallback early-exits on defined falsy ($label)", async ({
		value,
	}) => {
		const first = new FalsyReturnPlugin("first-tool", "afterTool", value);
		const second = new FalsyReturnPlugin("second-tool", "afterTool", {
			hit: true,
		});
		const manager = new PluginManager({ plugins: [first, second] });

		await expect(
			manager.runAfterToolCallback({
				tool: {} as any,
				toolArgs: {},
				toolContext: {} as any,
				result: {},
			}),
		).resolves.toBe(value);
		expect(first.calls).toBe(1);
		expect(second.calls).toBe(0);
	});

	it.each([
		{ label: "0", value: 0 },
		{ label: "empty-string", value: "" },
	] as const)("runOnEventCallback early-exits on defined falsy ($label)", async ({
		value,
	}) => {
		const first = new FalsyReturnPlugin("first-event", "onEvent", value);
		const second = new FalsyReturnPlugin("second-event", "onEvent", {
			hit: true,
		});
		const manager = new PluginManager({ plugins: [first, second] });

		await expect(
			manager.runOnEventCallback({
				invocationContext: {} as any,
				event: {} as any,
			}),
		).resolves.toBe(value);
		expect(first.calls).toBe(1);
		expect(second.calls).toBe(0);
	});

	it.each([
		{ label: "null", value: null },
		{ label: "false", value: false },
	] as const)("runOnToolErrorCallback early-exits on defined falsy ($label)", async ({
		value,
	}) => {
		const first = new FalsyReturnPlugin("first-tool-err", "onToolError", value);
		const second = new FalsyReturnPlugin("second-tool-err", "onToolError", {
			hit: true,
		});
		const manager = new PluginManager({ plugins: [first, second] });

		await expect(
			manager.runOnToolErrorCallback({
				tool: {} as any,
				toolArgs: {},
				toolContext: {} as any,
				error: new Error("boom"),
			}),
		).resolves.toBe(value);
		expect(first.calls).toBe(1);
		expect(second.calls).toBe(0);
	});

	it.each([
		{ label: "0", value: 0 },
		{ label: "empty-string", value: "" },
	] as const)("runOnModelErrorCallback early-exits on defined falsy ($label)", async ({
		value,
	}) => {
		const first = new FalsyReturnPlugin(
			"first-model-err",
			"onModelError",
			value,
		);
		const second = new FalsyReturnPlugin("second-model-err", "onModelError", {
			hit: true,
		});
		const manager = new PluginManager({ plugins: [first, second] });

		await expect(
			manager.runOnModelErrorCallback({
				callbackContext: {} as any,
				llmRequest: {} as any,
				error: new Error("boom"),
			}),
		).resolves.toBe(value);
		expect(first.calls).toBe(1);
		expect(second.calls).toBe(0);
	});
});
