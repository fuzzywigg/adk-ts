import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createTool } from "../../../tools/base/create-tool";
import type { ToolContext } from "../../../tools/tool-context";

function makeContext(overrides: Partial<ToolContext> = {}): ToolContext {
	return { actions: {}, ...overrides } as ToolContext;
}

describe("createTool leftover edges", () => {
	it("builds declarations for nested object and array schemas", () => {
		const tool = createTool({
			name: "nested_schema",
			description: "Handles nested shapes",
			schema: z.object({
				profile: z.object({
					name: z.string(),
					tags: z.array(z.string()),
				}),
				count: z.number().optional(),
			}),
			fn: ({ profile, count }) => ({ profile, count: count ?? 0 }),
		});

		const declaration = tool.getDeclaration();
		expect(declaration?.parameters?.properties?.profile).toBeDefined();
		expect(declaration?.parameters?.properties?.count).toBeDefined();
	});

	it("returns detailed zod issues for multiple invalid fields", async () => {
		const tool = createTool({
			name: "multi_invalid",
			description: "Validates several fields",
			schema: z.object({
				a: z.string(),
				b: z.number(),
				c: z.boolean(),
			}),
			fn: (args) => args,
		});

		const result = await tool.runAsync(
			{ a: 1, b: "x", c: "no" },
			makeContext(),
		);
		expect(result.error).toContain("Invalid arguments for multi_invalid");
		expect(String(result.error)).toMatch(/a|b|c/);
	});

	it("supports enum and literal schemas in declarations", () => {
		const tool = createTool({
			name: "enum_tool",
			description: "Uses enum values",
			schema: z.object({
				mode: z.enum(["fast", "slow"]),
				kind: z.literal("demo"),
			}),
			fn: ({ mode, kind }) => ({ mode, kind }),
		});

		const declaration = tool.getDeclaration();
		expect(declaration?.parameters?.properties?.mode).toBeDefined();
		expect(declaration?.parameters?.properties?.kind).toBeDefined();
	});

	it("honors isLongRunning and retry options on the created tool", () => {
		const tool = createTool({
			name: "long_retry",
			description: "Long running with retries",
			isLongRunning: true,
			shouldRetryOnFailure: true,
			maxRetryAttempts: 5,
			fn: () => ({ ok: true }),
		});

		expect(tool.isLongRunning).toBe(true);
		expect(tool.shouldRetryOnFailure).toBe(true);
		expect(tool.maxRetryAttempts).toBe(5);
	});

	it("awaits async fn rejections and returns an error envelope", async () => {
		const tool = createTool({
			name: "async_fail",
			description: "Rejects asynchronously",
			fn: async () => {
				await Promise.resolve();
				throw new Error("async boom");
			},
		});

		await expect(tool.runAsync({}, makeContext())).resolves.toEqual({
			error: "Error executing async_fail: async boom",
		});
	});

	it("passes through arrays and nested objects as falsy-preserving truthy results", async () => {
		const tool = createTool({
			name: "complex_result",
			description: "Returns complex payloads",
			fn: () => [{ id: 1 }, { id: 2 }],
		});

		await expect(tool.runAsync({}, makeContext())).resolves.toEqual([
			{ id: 1 },
			{ id: 2 },
		]);
	});

	it("works with zod defaulted fields when args omit them", async () => {
		const tool = createTool({
			name: "defaults_tool",
			description: "Applies zod defaults",
			schema: z.object({
				label: z.string().default("none"),
				n: z.number().default(1),
			}),
			fn: ({ label, n }) => ({ label, n }),
		});

		await expect(tool.runAsync({}, makeContext())).resolves.toEqual({
			label: "none",
			n: 1,
		});
	});

	it("supports union schemas for flexible input", async () => {
		const tool = createTool({
			name: "union_tool",
			description: "Accepts string or number id",
			schema: z.object({
				id: z.union([z.string(), z.number()]),
			}),
			fn: ({ id }) => ({ id, type: typeof id }),
		});

		await expect(tool.runAsync({ id: "abc" }, makeContext())).resolves.toEqual({
			id: "abc",
			type: "string",
		});
		await expect(tool.runAsync({ id: 9 }, makeContext())).resolves.toEqual({
			id: 9,
			type: "number",
		});
	});

	it("preserves functionCallId from ToolContext when fn reads it", async () => {
		const tool = createTool({
			name: "ctx_id",
			description: "Reads function call id",
			fn: (_args, ctx) => ({ id: (ctx as any).functionCallId }),
		});

		await expect(
			tool.runAsync({}, makeContext({ functionCallId: "fc-42" } as any)),
		).resolves.toEqual({ id: "fc-42" });
	});

	it("schema-less tools parse empty object schemas and ignore unknown keys", async () => {
		const tool = createTool({
			name: "freeform",
			description: "No schema validation",
			fn: (args) => ({ keys: Object.keys(args).sort(), args }),
		});

		await expect(
			tool.runAsync({ a: 1, z: true, m: "x" }, makeContext()),
		).resolves.toEqual({ keys: [], args: {} });
	});

	it("safeExecute validates through BaseTool when declaration requires fields", async () => {
		const tool = createTool({
			name: "safe_create",
			description: "Create tool safe execute",
			schema: z.object({ q: z.string() }),
			fn: ({ q }) => ({ q }),
		});
		vi.spyOn(console, "error").mockImplementation(() => {});

		const invalid = await tool.safeExecute({}, makeContext());
		expect(invalid).toMatchObject({ error: "Invalid arguments" });

		const valid = await tool.safeExecute({ q: "hi" }, makeContext());
		expect(valid).toEqual({ result: { q: "hi" } });
	});

	it("coalesces only null and undefined results to empty object", async () => {
		const values = [0, false, "", [], {}, null, undefined] as const;
		const results = [];
		for (const [i, value] of values.entries()) {
			const tool = createTool({
				name: `coalesce_${i}`,
				description: "Coalesce matrix",
				fn: () => value as any,
			});
			results.push(await tool.runAsync({}, makeContext()));
		}
		expect(results).toEqual([0, false, "", [], {}, {}, {}]);
	});
});
