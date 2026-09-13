import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createTool } from "../../../tools/base/create-tool";
import type { ToolContext } from "../../../tools/tool-context";

function makeContext(): ToolContext {
	return { actions: {} } as ToolContext;
}

describe("createTool", () => {
	it("validates args with zod and returns function results", async () => {
		const tool = createTool({
			name: "add_numbers",
			description: "Adds two numbers",
			schema: z.object({
				a: z.number(),
				b: z.number(),
			}),
			fn: ({ a, b }) => ({ sum: a + b }),
		});

		const result = await tool.runAsync({ a: 2, b: 3 }, makeContext());
		expect(result).toEqual({ sum: 5 });

		const declaration = tool.getDeclaration();
		expect(declaration?.name).toBe("add_numbers");
		expect(declaration?.parameters).toMatchObject({
			type: "object",
			properties: {
				a: { type: "number" },
				b: { type: "number" },
			},
		});
	});

	it("returns validation errors for invalid args", async () => {
		const tool = createTool({
			name: "echo_text",
			description: "Echoes text",
			schema: z.object({ text: z.string() }),
			fn: ({ text }) => ({ text }),
		});

		const result = await tool.runAsync({ text: 1 }, makeContext());
		expect(result.error).toContain("Invalid arguments for echo_text");
	});

	it("supports tools without schema and preserves falsy results", async () => {
		const tool = createTool({
			name: "zero_tool",
			description: "Returns zero",
			fn: () => 0,
		});

		expect(await tool.runAsync({}, makeContext())).toBe(0);
		expect(tool.getDeclaration()?.parameters).toMatchObject({
			type: "object",
		});
	});

	it("wraps thrown errors from the tool function", async () => {
		const tool = createTool({
			name: "boom_tool",
			description: "Always fails",
			fn: () => {
				throw new Error("nope");
			},
		});

		const result = await tool.runAsync({}, makeContext());
		expect(result).toEqual({ error: "Error executing boom_tool: nope" });
	});

	it("awaits async fn and coalesces null/undefined to empty object", async () => {
		const asyncTool = createTool({
			name: "async_echo",
			description: "Async echo",
			schema: z.object({ value: z.string() }),
			fn: async ({ value }) => {
				await Promise.resolve();
				return { value };
			},
		});
		await expect(
			asyncTool.runAsync({ value: "ok" }, makeContext()),
		).resolves.toEqual({ value: "ok" });

		const nullTool = createTool({
			name: "null_tool",
			description: "Returns null",
			fn: () => null,
		});
		await expect(nullTool.runAsync({}, makeContext())).resolves.toEqual({});

		const undefTool = createTool({
			name: "undef_tool",
			description: "Returns undefined",
			fn: () => undefined,
		});
		await expect(undefTool.runAsync({}, makeContext())).resolves.toEqual({});
	});

	it("stringifies non-Error throws and passes retry/long-running flags", async () => {
		const tool = createTool({
			name: "throw_string",
			description: "Throws a string",
			isLongRunning: true,
			shouldRetryOnFailure: true,
			maxRetryAttempts: 7,
			fn: () => {
				throw "plain failure";
			},
		});

		expect(tool.isLongRunning).toBe(true);
		expect(tool.shouldRetryOnFailure).toBe(true);
		expect(tool.maxRetryAttempts).toBe(7);
		await expect(tool.runAsync({}, makeContext())).resolves.toEqual({
			error: "Error executing throw_string: plain failure",
		});
	});
});
