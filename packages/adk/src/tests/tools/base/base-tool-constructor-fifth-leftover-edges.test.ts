import { describe, expect, it } from "vitest";
import { BaseTool } from "../../../tools/base/base-tool";
import type { ToolContext } from "../../../tools/tool-context";

class StubTool extends BaseTool {
	async runAsync(_args: Record<string, any>, _context: ToolContext) {
		return { ok: true };
	}
}

describe("BaseTool constructor fifth leftover coalesce matrices", () => {
	const falsyLongRunning = [undefined, null, false, 0, ""] as const;
	for (const [i, value] of falsyLongRunning.entries()) {
		it(`coalesces isLongRunning falsy #${i} (${JSON.stringify(value)}) → false`, () => {
			const tool = new StubTool({
				name: `long_run_${i}`,
				description: "Constructor coalesce matrix for isLongRunning",
				isLongRunning: value as any,
			});
			expect(tool.isLongRunning).toBe(false);
		});
	}

	const falsyRetry = [undefined, null, false, 0, ""] as const;
	for (const [i, value] of falsyRetry.entries()) {
		it(`coalesces shouldRetryOnFailure falsy #${i} (${JSON.stringify(value)}) → false`, () => {
			const tool = new StubTool({
				name: `retry_flag_${i}`,
				description: "Constructor coalesce matrix for shouldRetryOnFailure",
				shouldRetryOnFailure: value as any,
			});
			expect(tool.shouldRetryOnFailure).toBe(false);
		});
	}

	const falsyMaxAttempts = [undefined, null, false, 0, "", Number.NaN] as const;
	for (const [i, value] of falsyMaxAttempts.entries()) {
		it(`coalesces maxRetryAttempts falsy #${i} (${String(value)}) → 3`, () => {
			const tool = new StubTool({
				name: `max_retry_${i}`,
				description: "Constructor coalesce matrix for maxRetryAttempts",
				maxRetryAttempts: value as any,
			});
			expect(tool.maxRetryAttempts).toBe(3);
		});
	}

	it.each([
		1, 2, 4, 7, 99,
	])("preserves truthy maxRetryAttempts=%s", (maxRetryAttempts) => {
		const tool = new StubTool({
			name: `max_ok_${maxRetryAttempts}`,
			description: "Preserves positive maxRetryAttempts values",
			maxRetryAttempts,
		});
		expect(tool.maxRetryAttempts).toBe(maxRetryAttempts);
	});

	it.each([
		{ isLongRunning: true, shouldRetryOnFailure: true, maxRetryAttempts: 8 },
		{ isLongRunning: true, shouldRetryOnFailure: false, maxRetryAttempts: 1 },
		{ isLongRunning: false, shouldRetryOnFailure: true, maxRetryAttempts: 2 },
	])("combo matrix %#", (opts) => {
		const tool = new StubTool({
			name: `combo_${opts.maxRetryAttempts}`,
			description: "Combined constructor option matrix",
			...opts,
		});
		expect(tool.isLongRunning).toBe(opts.isLongRunning);
		expect(tool.shouldRetryOnFailure).toBe(opts.shouldRetryOnFailure);
		expect(tool.maxRetryAttempts).toBe(opts.maxRetryAttempts);
	});

	it.each([
		"a",
		"A1",
		"tool_name",
		"Tool_Name_99",
		"__",
		"x_y_z",
		"CamelCase",
	])("accepts valid name %s", (name) => {
		const tool = new StubTool({
			name,
			description: "Valid name acceptance matrix",
		});
		expect(tool.name).toBe(name);
	});

	it.each([
		"bad-name",
		"has space",
		"dot.name",
		"slash/name",
		"at@name",
		"",
	])("rejects invalid name %j", (name) => {
		expect(
			() =>
				new StubTool({
					name,
					description: "Enough characters for description",
				}),
		).toThrow(/Invalid tool name/);
	});

	it.each([
		"",
		"a",
		"ab",
		null,
		undefined,
	] as const)("rejects short/missing description %j", (description) => {
		expect(
			() =>
				new StubTool({
					name: "desc_tool",
					description: description as any,
				}),
		).toThrow(/too short/);
	});

	it("keeps default retry delay fields", () => {
		const tool = new StubTool({
			name: "delay_defaults",
			description: "Default delay fields remain unchanged",
		});
		expect(tool.baseRetryDelay).toBe(1000);
		expect(tool.maxRetryDelay).toBe(10000);
	});
});
