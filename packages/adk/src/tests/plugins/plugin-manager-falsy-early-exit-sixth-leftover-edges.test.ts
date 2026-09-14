import { describe, expect, it } from "vitest";
import { BasePlugin } from "../../plugins/base-plugin";
import { PluginManager } from "../../plugins/plugin-manager";

class FalsyBeforeRunPlugin extends BasePlugin {
	calls = 0;

	constructor(
		name: string,
		private readonly value: unknown,
	) {
		super(name);
	}

	async beforeRunCallback(): Promise<any> {
		this.calls += 1;
		return this.value;
	}
}

class FalsyBeforeToolPlugin extends BasePlugin {
	calls = 0;

	constructor(
		name: string,
		private readonly value: unknown,
	) {
		super(name);
	}

	async beforeToolCallback(): Promise<any> {
		this.calls += 1;
		return this.value;
	}
}

class FalsyOnUserMessagePlugin extends BasePlugin {
	calls = 0;

	constructor(
		name: string,
		private readonly value: unknown,
	) {
		super(name);
	}

	async onUserMessageCallback(): Promise<any> {
		this.calls += 1;
		return this.value;
	}
}

describe("PluginManager falsy early-exit sixth leftover (post #151)", () => {
	it.each([
		{ label: "null", value: null },
		{ label: "0", value: 0 },
		{ label: "empty-string", value: "" },
		{ label: "false", value: false },
	] as const)("runBeforeRunCallback early-exits on defined falsy ($label) via result !== undefined", async ({
		value,
	}) => {
		const first = new FalsyBeforeRunPlugin("first", value);
		const second = new FalsyBeforeRunPlugin("second", { should: "not-run" });
		const manager = new PluginManager({ plugins: [first, second] });

		await expect(
			manager.runBeforeRunCallback({ invocationContext: {} as any }),
		).resolves.toBe(value);
		expect(first.calls).toBe(1);
		expect(second.calls).toBe(0);
	});

	it.each([
		{ label: "null", value: null },
		{ label: "0", value: 0 },
		{ label: "false", value: false },
	] as const)("runBeforeToolCallback early-exits on defined falsy ($label)", async ({
		value,
	}) => {
		const first = new FalsyBeforeToolPlugin("first-tool", value);
		const second = new FalsyBeforeToolPlugin("second-tool", {
			hit: true,
		});
		const manager = new PluginManager({ plugins: [first, second] });

		await expect(
			manager.runBeforeToolCallback({
				tool: {} as any,
				toolArgs: {},
				toolContext: {} as any,
			}),
		).resolves.toBe(value);
		expect(first.calls).toBe(1);
		expect(second.calls).toBe(0);
	});

	it.each([
		{ label: "empty-string", value: "" },
		{ label: "false", value: false },
	] as const)("runOnUserMessageCallback early-exits on defined falsy ($label)", async ({
		value,
	}) => {
		const first = new FalsyOnUserMessagePlugin("first-msg", value);
		const second = new FalsyOnUserMessagePlugin("second-msg", {
			content: "x",
		});
		const manager = new PluginManager({ plugins: [first, second] });

		await expect(
			manager.runOnUserMessageCallback({
				userMessage: {} as any,
				invocationContext: {} as any,
			}),
		).resolves.toBe(value);
		expect(first.calls).toBe(1);
		expect(second.calls).toBe(0);
	});

	it("continues when first plugin returns undefined, then exits on second falsy 0", async () => {
		const skip = new FalsyBeforeRunPlugin("skip", undefined);
		const hit = new FalsyBeforeRunPlugin("hit", 0);
		const never = new FalsyBeforeRunPlugin("never", { late: true });
		const manager = new PluginManager({ plugins: [skip, hit, never] });

		await expect(
			manager.runBeforeRunCallback({ invocationContext: {} as any }),
		).resolves.toBe(0);
		expect(skip.calls).toBe(1);
		expect(hit.calls).toBe(1);
		expect(never.calls).toBe(0);
	});
});
