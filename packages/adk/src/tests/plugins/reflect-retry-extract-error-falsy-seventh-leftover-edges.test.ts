import { describe, expect, it } from "vitest";
import type { InvocationContext } from "../../agents/invocation-context";
import {
	REFLECT_AND_RETRY_RESPONSE_TYPE,
	ReflectAndRetryToolPlugin,
} from "../../plugins/reflect-retry-tool-plugin";
import type { BaseTool } from "../../tools/base/base-tool";
import { ToolContext } from "../../tools/tool-context";

function makeTool(name = "flaky_tool"): BaseTool {
	return { name } as BaseTool;
}

function makeToolContext(invocationId = "inv-1"): ToolContext {
	return new ToolContext({
		invocationId,
		agent: { name: "agent" },
		session: { id: "sess", state: {} },
		appName: "app",
		userId: "user",
	} as unknown as InvocationContext);
}

class FalsyExtractPlugin extends ReflectAndRetryToolPlugin {
	constructor(
		private readonly extracted: unknown,
		opts: { maxRetries?: number } = {},
	) {
		super({
			maxRetries: opts.maxRetries ?? 3,
			throwExceptionIfRetryExceeded: false,
		});
	}

	override async extractErrorFromResult(): Promise<any> {
		return this.extracted;
	}
}

describe("ReflectAndRetry extractError falsy + null result seventh leftover (post #158)", () => {
	it.each([
		{ label: "null", value: null },
		{ label: "0", value: 0 },
		{ label: "empty-string", value: "" },
		{ label: "false", value: false },
	] as const)("afterToolCallback treats falsy extractError ($label) as success and resets", async ({
		value,
	}) => {
		const plugin = new FalsyExtractPlugin(value, { maxRetries: 2 });
		const tool = makeTool("t");
		const toolContext = makeToolContext("inv-falsy");

		await plugin.onToolErrorCallback({
			tool,
			toolArgs: {},
			toolContext,
			error: new Error("seed"),
		});
		expect((plugin as any)._scopedFailureCounters["inv-falsy"]?.t).toBe(1);

		const result = await plugin.afterToolCallback({
			tool,
			toolArgs: {},
			toolContext,
			result: { ok: true },
		});
		expect(result).toBeUndefined();
		expect(
			(plugin as any)._scopedFailureCounters["inv-falsy"]?.t,
		).toBeUndefined();
	});

	it("truthy extracted error still enters _handleToolError", async () => {
		const plugin = new FalsyExtractPlugin(new Error("from-result"), {
			maxRetries: 2,
		});
		const out = await plugin.afterToolCallback({
			tool: makeTool(),
			toolArgs: { x: 1 },
			toolContext: makeToolContext("inv-truthy"),
			result: { ok: false },
		});
		expect(out?.response_type).toBe(REFLECT_AND_RETRY_RESPONSE_TYPE);
		expect(out?.retry_count).toBe(1);
	});

	it.each([
		{ label: "null", result: null },
		{ label: "undefined", result: undefined },
	] as const)("afterToolCallback with $label result skips reflect ignore and resets via default extract", async ({
		result,
	}) => {
		const plugin = new ReflectAndRetryToolPlugin({
			maxRetries: 2,
			throwExceptionIfRetryExceeded: false,
		});
		const tool = makeTool("n");
		const toolContext = makeToolContext("inv-nullish");

		await plugin.onToolErrorCallback({
			tool,
			toolArgs: {},
			toolContext,
			error: new Error("prior"),
		});
		expect((plugin as any)._scopedFailureCounters["inv-nullish"]?.n).toBe(1);

		await expect(
			plugin.afterToolCallback({
				tool,
				toolArgs: {},
				toolContext,
				result,
			}),
		).resolves.toBeUndefined();
		expect(
			(plugin as any)._scopedFailureCounters["inv-nullish"]?.n,
		).toBeUndefined();
	});
});
