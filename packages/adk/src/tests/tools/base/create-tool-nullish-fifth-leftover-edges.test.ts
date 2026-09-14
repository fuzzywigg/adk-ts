import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createTool } from "../../../tools/base/create-tool";
import type { ToolContext } from "../../../tools/tool-context";

function makeContext(): ToolContext {
	return { actions: {} } as ToolContext;
}

describe("createTool nullish fifth leftover coalesce matrices", () => {
	const falsyFlags = [undefined, null] as const;
	for (const [i, value] of falsyFlags.entries()) {
		it(`?? false for isLongRunning nullish #${i}`, () => {
			const tool = createTool({
				name: `long_nullish_${i}`,
				description: "createTool isLongRunning nullish coalesce",
				isLongRunning: value as any,
				fn: () => ({ ok: true }),
			});
			expect(tool.isLongRunning).toBe(false);
		});

		it(`?? false for shouldRetryOnFailure nullish #${i}`, () => {
			const tool = createTool({
				name: `retry_nullish_${i}`,
				description: "createTool shouldRetryOnFailure nullish coalesce",
				shouldRetryOnFailure: value as any,
				fn: () => ({ ok: true }),
			});
			expect(tool.shouldRetryOnFailure).toBe(false);
		});
	}

	it("maxRetryAttempts undefined/null coalesce to 3 via ?? then ||", () => {
		for (const [i, value] of [undefined, null].entries()) {
			const tool = createTool({
				name: `max_nullish_${i}`,
				description: "createTool maxRetryAttempts nullish path",
				maxRetryAttempts: value as any,
				fn: () => ({ ok: true }),
			});
			expect(tool.maxRetryAttempts).toBe(3);
		}
	});

	it("maxRetryAttempts 0 survives createTool ?? then BaseTool || coerces to 3", () => {
		const tool = createTool({
			name: "max_zero",
			description: "Zero maxRetryAttempts double-coalesce path",
			maxRetryAttempts: 0,
			fn: () => ({ ok: true }),
		});
		// CreatedTool passes 0 through ?? (keeps 0); BaseTool then does 0 || 3 → 3
		expect(tool.maxRetryAttempts).toBe(3);
	});

	it("explicit false flags survive createTool ?? into BaseTool", () => {
		const tool = createTool({
			name: "explicit_false",
			description: "Explicit false flags through createTool",
			isLongRunning: false,
			shouldRetryOnFailure: false,
			fn: () => ({ ok: true }),
		});
		expect(tool.isLongRunning).toBe(false);
		expect(tool.shouldRetryOnFailure).toBe(false);
	});

	it("truthy createTool options pass through unchanged", () => {
		const tool = createTool({
			name: "truthy_opts",
			description: "Truthy createTool option passthrough",
			isLongRunning: true,
			shouldRetryOnFailure: true,
			maxRetryAttempts: 11,
			fn: () => ({ ok: true }),
		});
		expect(tool.isLongRunning).toBe(true);
		expect(tool.shouldRetryOnFailure).toBe(true);
		expect(tool.maxRetryAttempts).toBe(11);
	});

	it("omitted schema uses empty object schema equivalent", async () => {
		const omitted = createTool({
			name: "schema_omitted",
			description: "Omitted schema defaults to empty object",
			fn: (args) => ({ keys: Object.keys(args) }),
		});
		const explicit = createTool({
			name: "schema_explicit",
			description: "Explicit empty object schema",
			schema: z.object({}),
			fn: (args) => ({ keys: Object.keys(args) }),
		});
		await expect(
			omitted.runAsync({ stray: 1 }, makeContext()),
		).resolves.toEqual({ keys: [] });
		await expect(
			explicit.runAsync({ stray: 1 }, makeContext()),
		).resolves.toEqual({ keys: [] });
		expect(omitted.getDeclaration()?.parameters).toBeDefined();
		expect(explicit.getDeclaration()?.parameters).toBeDefined();
		expect(
			(omitted.getDeclaration()?.parameters as any).$schema,
		).toBeUndefined();
		expect(
			(explicit.getDeclaration()?.parameters as any).$schema,
		).toBeUndefined();
	});

	it.each([
		0,
		false,
		"",
		Number.NaN,
	] as const)("preserves falsy result %j via ?? {}", async (value) => {
		const tool = createTool({
			name: `falsy_${String(value)}`,
			description: "Preserves falsy runAsync results",
			fn: () => value as any,
		});
		await expect(tool.runAsync({}, makeContext())).resolves.toEqual(value);
	});

	it.each([
		null,
		undefined,
	] as const)("coalesces nullish result %j to {}", async (value) => {
		const tool = createTool({
			name: `nullish_result_${String(value)}`,
			description: "Nullish results become empty object",
			fn: () => value as any,
		});
		await expect(tool.runAsync({}, makeContext())).resolves.toEqual({});
	});

	it("supports sync and async fn returning nested payloads", async () => {
		const syncTool = createTool({
			name: "sync_nested",
			description: "Sync nested payload",
			schema: z.object({ n: z.number() }),
			fn: ({ n }) => ({ nested: { n, ok: true } }),
		});
		const asyncTool = createTool({
			name: "async_nested",
			description: "Async nested payload",
			schema: z.object({ n: z.number() }),
			fn: async ({ n }) => {
				await Promise.resolve();
				return { nested: { n, ok: true } };
			},
		});
		await expect(syncTool.runAsync({ n: 3 }, makeContext())).resolves.toEqual({
			nested: { n: 3, ok: true },
		});
		await expect(asyncTool.runAsync({ n: 3 }, makeContext())).resolves.toEqual({
			nested: { n: 3, ok: true },
		});
	});
});
