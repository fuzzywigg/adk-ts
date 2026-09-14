import { Type } from "@google/genai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BaseTool } from "../../../tools/base/base-tool";
import type { ToolContext } from "../../../tools/tool-context";

class ConfigurableTool extends BaseTool {
	constructor(
		config: ConstructorParameters<typeof BaseTool>[0],
		private readonly decl: any,
		private readonly impl?: (args: Record<string, any>) => Promise<any>,
	) {
		super(config);
	}

	getDeclaration() {
		return this.decl;
	}

	async runAsync(args: Record<string, any>, _context: ToolContext) {
		if (this.impl) {
			return this.impl(args);
		}
		return { ok: true, args };
	}
}

function makeContext(): ToolContext {
	return { actions: {} } as ToolContext;
}

describe("BaseTool validateArguments / safeExecute fifth leftover edges", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("validateArguments returns true when declaration is null", () => {
		const tool = new ConfigurableTool(
			{ name: "null_decl_v", description: "Null declaration skips validation" },
			null,
		);
		expect(tool.validateArguments({})).toBe(true);
		expect(tool.validateArguments({ anything: 1 })).toBe(true);
	});

	it("validateArguments returns true when parameters is null/undefined/falsy", () => {
		const cases = [undefined, null, false, 0, ""] as const;
		for (const [i, parameters] of cases.entries()) {
			const tool = new ConfigurableTool(
				{
					name: `params_falsy_${i}`,
					description: "Falsy parameters skip required checks",
				},
				{ name: `params_falsy_${i}`, parameters },
			);
			expect(tool.validateArguments({})).toBe(true);
		}
	});

	it("treats missing required array as empty via required || []", () => {
		const tool = new ConfigurableTool(
			{
				name: "no_required",
				description: "Missing required list means all args valid",
			},
			{
				name: "no_required",
				parameters: {
					type: Type.OBJECT,
					properties: { q: { type: Type.STRING } },
				},
			},
		);
		expect(tool.validateArguments({})).toBe(true);
	});

	it("treats falsy required list as empty", () => {
		for (const required of [null, undefined, false, 0, ""] as const) {
			const tool = new ConfigurableTool(
				{
					name: "req_falsy",
					description: "Falsy required coalesce to empty list",
				},
				{
					name: "req_falsy",
					parameters: {
						type: Type.OBJECT,
						properties: {},
						required: required as any,
					},
				},
			);
			expect(tool.validateArguments({})).toBe(true);
		}
	});

	it("fails on first missing required and logs it", () => {
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		const tool = new ConfigurableTool(
			{
				name: "multi_req",
				description: "Stops at first missing required param",
			},
			{
				name: "multi_req",
				parameters: {
					type: Type.OBJECT,
					properties: {
						a: { type: Type.STRING },
						b: { type: Type.STRING },
					},
					required: ["a", "b"],
				},
			},
		);
		expect(tool.validateArguments({ b: "only-b" })).toBe(false);
		expect(error).toHaveBeenCalledWith(
			'Missing required parameter "a" for tool "multi_req"',
		);
		expect(tool.validateArguments({ a: "x", b: "y" })).toBe(true);
	});

	it("safeExecute returns validation envelope without calling runAsync", async () => {
		const impl = vi.fn(async () => ({ ran: true }));
		const tool = new ConfigurableTool(
			{
				name: "safe_invalid",
				description: "Validation short-circuit before run",
			},
			{
				name: "safe_invalid",
				parameters: {
					type: Type.OBJECT,
					properties: { q: { type: Type.STRING } },
					required: ["q"],
				},
			},
			impl,
		);
		vi.spyOn(console, "error").mockImplementation(() => {});
		await expect(tool.safeExecute({}, makeContext())).resolves.toEqual({
			error: "Invalid arguments",
			message: "The provided arguments do not match the tool's requirements.",
		});
		expect(impl).not.toHaveBeenCalled();
	});

	it("safeExecute wraps non-Error throws via String(error)", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		const tool = new ConfigurableTool(
			{
				name: "string_throw",
				description: "Non-Error throw wrapping path",
			},
			null,
			async () => {
				throw "plain-string-fail";
			},
		);
		await expect(tool.safeExecute({}, makeContext())).resolves.toEqual({
			error: "Execution failed",
			message: "plain-string-fail",
			tool: "string_throw",
		});
	});

	it("safeExecute uses Unknown error when Error message is empty", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		const tool = new ConfigurableTool(
			{
				name: "empty_msg",
				description: "Empty Error message coalesce leftover",
			},
			null,
			async () => {
				throw new Error("");
			},
		);
		const result = await tool.safeExecute({}, makeContext());
		expect(result).toEqual({
			error: "Execution failed",
			message: "Unknown error occurred",
			tool: "empty_msg",
		});
	});

	it("safeExecute does not retry when shouldRetryOnFailure is falsy", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		let calls = 0;
		const tool = new ConfigurableTool(
			{
				name: "no_retry",
				description: "Single attempt when retry disabled",
				shouldRetryOnFailure: false,
				maxRetryAttempts: 5,
			},
			null,
			async () => {
				calls += 1;
				throw new Error(`fail-${calls}`);
			},
		);
		await expect(tool.safeExecute({}, makeContext())).resolves.toMatchObject({
			error: "Execution failed",
			message: "fail-1",
		});
		expect(calls).toBe(1);
	});

	it("safeExecute retries then succeeds within maxRetryAttempts", async () => {
		vi.useFakeTimers();
		vi.spyOn(console, "error").mockImplementation(() => {});
		vi.spyOn(Math, "random").mockReturnValue(0);
		let calls = 0;
		const tool = new ConfigurableTool(
			{
				name: "retry_ok",
				description: "Succeeds after one failed attempt",
				shouldRetryOnFailure: true,
				maxRetryAttempts: 2,
			},
			null,
			async () => {
				calls += 1;
				if (calls === 1) {
					throw new Error("transient");
				}
				return { recovered: true };
			},
		);
		tool.baseRetryDelay = 10;
		tool.maxRetryDelay = 100;
		const pending = tool.safeExecute({}, makeContext());
		await vi.runAllTimersAsync();
		await expect(pending).resolves.toEqual({ result: { recovered: true } });
		expect(calls).toBe(2);
		vi.useRealTimers();
	});

	it("apiVariant defaults to google", () => {
		const tool = new ConfigurableTool(
			{ name: "api_variant", description: "Default apiVariant accessor" },
			null,
		);
		expect((tool as any).apiVariant).toBe("google");
	});

	it("default runAsync throws not implemented on bare subclass", async () => {
		class Bare extends BaseTool {}
		const tool = new Bare({
			name: "bare_tool",
			description: "Uses BaseTool.runAsync default throw",
		});
		await expect(tool.runAsync({}, makeContext())).rejects.toThrow(
			/Bare runAsync is not implemented/,
		);
	});
});
