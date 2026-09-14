import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createTool } from "../../../tools/base/create-tool";
import type { ToolContext } from "../../../tools/tool-context";

function makeContext(): ToolContext {
	return { actions: {} } as ToolContext;
}

describe("createTool error envelope fifth leftover edges", () => {
	it("prefixes ZodError with tool name", async () => {
		const tool = createTool({
			name: "zod_prefix",
			description: "Zod error envelope naming",
			schema: z.object({ q: z.string().min(2) }),
			fn: ({ q }) => ({ q }),
		});
		const result = await tool.runAsync({ q: "x" }, makeContext());
		expect(result.error).toMatch(/^Invalid arguments for zod_prefix:/);
	});

	it("wraps Error throws with tool name prefix", async () => {
		const tool = createTool({
			name: "err_prefix",
			description: "Error throw envelope naming",
			fn: () => {
				throw new Error("boom-msg");
			},
		});
		await expect(tool.runAsync({}, makeContext())).resolves.toEqual({
			error: "Error executing err_prefix: boom-msg",
		});
	});

	it("wraps empty Error.message without falling through to Unknown", async () => {
		const tool = createTool({
			name: "empty_err",
			description: "Empty Error message still prefixes tool name",
			fn: () => {
				throw new Error("");
			},
		});
		await expect(tool.runAsync({}, makeContext())).resolves.toEqual({
			error: "Error executing empty_err: ",
		});
	});

	it.each([
		["string-throw", "string-throw"],
		[42, "42"],
		[{ a: 1 }, "[object Object]"],
		[null, "null"],
		[undefined, "undefined"],
		[true, "true"],
	] as const)("String(error) wraps non-Error %j → %s", async (thrown, expected) => {
		const tool = createTool({
			name: "non_error",
			description: "Non-Error throw stringification matrix",
			fn: () => {
				throw thrown as any;
			},
		});
		await expect(tool.runAsync({}, makeContext())).resolves.toEqual({
			error: `Error executing non_error: ${expected}`,
		});
	});

	it("refine failures surface as Invalid arguments envelopes", async () => {
		const tool = createTool({
			name: "refine_fail",
			description: "Zod refine failure path",
			schema: z
				.object({ a: z.number(), b: z.number() })
				.refine((v) => v.a < v.b, { message: "a must be < b" }),
			fn: (args) => args,
		});
		const result = await tool.runAsync({ a: 5, b: 1 }, makeContext());
		expect(result.error).toContain("Invalid arguments for refine_fail");
	});

	it("async rejection becomes error envelope not throw", async () => {
		const tool = createTool({
			name: "async_reject",
			description: "Async rejection envelope",
			fn: async () => {
				await Promise.resolve();
				throw new Error("rejected");
			},
		});
		await expect(tool.runAsync({}, makeContext())).resolves.toEqual({
			error: "Error executing async_reject: rejected",
		});
	});

	it("declaration strips $schema for schema and schema-less tools", () => {
		const withSchema = createTool({
			name: "with_schema",
			description: "Declaration without $schema field",
			schema: z.object({ x: z.string() }),
			fn: ({ x }) => ({ x }),
		});
		const without = createTool({
			name: "without_schema",
			description: "Schema-less declaration without $schema",
			fn: () => ({ ok: true }),
		});
		for (const tool of [withSchema, without]) {
			const decl = tool.getDeclaration();
			expect(decl?.name).toBe(tool.name);
			expect(decl?.description).toBe(tool.description);
			expect((decl?.parameters as any).$schema).toBeUndefined();
		}
	});

	it("getDeclaration returns stable cached declaration object", () => {
		const tool = createTool({
			name: "stable_decl",
			description: "Cached declaration identity",
			schema: z.object({ n: z.number() }),
			fn: ({ n }) => ({ n }),
		});
		expect(tool.getDeclaration()).toBe(tool.getDeclaration());
	});
});
