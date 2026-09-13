import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createTool } from "../../../tools/base/create-tool";
import type { ToolContext } from "../../../tools/tool-context";

function makeContext(overrides: Partial<ToolContext> = {}): ToolContext {
	return { actions: {}, ...overrides } as ToolContext;
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

	it("preserves false and empty-string results while coalescing nullish to {}", async () => {
		const falseTool = createTool({
			name: "false_tool",
			description: "Returns false",
			fn: () => false,
		});
		const emptyTool = createTool({
			name: "empty_tool",
			description: "Returns empty string",
			fn: () => "",
		});
		const nullTool = createTool({
			name: "null_tool",
			description: "Returns null",
			fn: () => null,
		});
		const undefinedTool = createTool({
			name: "undef_tool",
			description: "Returns undefined",
			fn: () => undefined,
		});

		expect(await falseTool.runAsync({}, makeContext())).toBe(false);
		expect(await emptyTool.runAsync({}, makeContext())).toBe("");
		expect(await nullTool.runAsync({}, makeContext())).toEqual({});
		expect(await undefinedTool.runAsync({}, makeContext())).toEqual({});
	});

	it("passes ToolContext into fn and awaits async functions", async () => {
		const context = makeContext({ functionCallId: "fc-9" } as any);
		let seen: ToolContext | undefined;

		const tool = createTool({
			name: "async_ctx",
			description: "Uses context asynchronously",
			schema: z.object({ value: z.string() }),
			fn: async ({ value }, ctx) => {
				seen = ctx;
				await Promise.resolve();
				return { echoed: value, callId: (ctx as any).functionCallId };
			},
		});

		const result = await tool.runAsync({ value: "hi" }, context);
		expect(seen).toBe(context);
		expect(result).toEqual({ echoed: "hi", callId: "fc-9" });
	});

	it("includes nested zod descriptions and strips $schema from declaration", () => {
		const tool = createTool({
			name: "nested_tool",
			description: "Nested object schema",
			schema: z.object({
				user: z
					.object({
						id: z.string().describe("User id"),
						role: z.enum(["admin", "member"]).describe("Access role"),
					})
					.describe("User payload"),
				count: z.number().describe("Item count"),
			}),
			fn: (args) => args,
		});

		const parameters = tool.getDeclaration()?.parameters as Record<string, any>;
		expect(parameters.$schema).toBeUndefined();
		expect(parameters.type).toBe("object");
		expect(parameters.properties.user).toMatchObject({
			type: "object",
			description: "User payload",
		});
		expect(parameters.properties.user.properties.id.description).toBe(
			"User id",
		);
		expect(parameters.properties.count.description).toBe("Item count");
	});

	it("wires isLongRunning, shouldRetryOnFailure, and maxRetryAttempts", () => {
		const tool = createTool({
			name: "retry_tool",
			description: "Configured retries",
			fn: () => ({ ok: true }),
			isLongRunning: true,
			shouldRetryOnFailure: true,
			maxRetryAttempts: 7,
		});

		expect(tool.isLongRunning).toBe(true);
		expect(tool.shouldRetryOnFailure).toBe(true);
		expect(tool.maxRetryAttempts).toBe(7);
	});

	it("defaults retry options when omitted", () => {
		const tool = createTool({
			name: "defaults_tool",
			description: "Uses defaults",
			fn: () => ({ ok: true }),
		});

		expect(tool.isLongRunning).toBe(false);
		expect(tool.shouldRetryOnFailure).toBe(false);
		expect(tool.maxRetryAttempts).toBe(3);
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

	it("stringifies non-Error throws in the error envelope", async () => {
		const tool = createTool({
			name: "string_boom",
			description: "Throws a string",
			fn: () => {
				throw "plain failure";
			},
		});

		const result = await tool.runAsync({}, makeContext());
		expect(result).toEqual({
			error: "Error executing string_boom: plain failure",
		});
	});
});
