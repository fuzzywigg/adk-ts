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
});
