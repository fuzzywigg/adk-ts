import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createTool } from "../../../tools/base/create-tool";
import type { ToolContext } from "../../../tools/tool-context";

function makeContext(overrides: Partial<ToolContext> = {}): ToolContext {
	return { actions: {}, ...overrides } as ToolContext;
}

describe("createTool deepen edges (TOKENMAXX remainder)", () => {
	it("preserves falsy results 0 false empty-string via ?? {}", async () => {
		const zero = createTool({
			name: "zero_out",
			description: "Returns numeric zero",
			fn: () => 0,
		});
		const falsy = createTool({
			name: "bool_out",
			description: "Returns boolean false",
			fn: () => false,
		});
		const empty = createTool({
			name: "empty_out",
			description: "Returns empty string",
			fn: () => "",
		});
		expect(await zero.runAsync({}, makeContext())).toBe(0);
		expect(await falsy.runAsync({}, makeContext())).toBe(false);
		expect(await empty.runAsync({}, makeContext())).toBe("");
	});

	it("maps nullish results to empty object", async () => {
		const nullTool = createTool({
			name: "null_out",
			description: "Returns nullish",
			fn: () => null,
		});
		const undefTool = createTool({
			name: "undef_out",
			description: "Returns undefined value",
			fn: () => undefined,
		});
		expect(await nullTool.runAsync({}, makeContext())).toEqual({});
		expect(await undefTool.runAsync({}, makeContext())).toEqual({});
	});

	it("returns ZodError envelope distinct from generic Error envelope", async () => {
		const tool = createTool({
			name: "typed_echo",
			description: "Echoes a string field",
			schema: z.object({ text: z.string() }),
			fn: ({ text }) => {
				if (text === "throw") {
					throw new Error("runtime-boom");
				}
				return { text };
			},
		});
		const zodFail = await tool.runAsync({ text: 1 }, makeContext());
		expect(zodFail.error).toMatch(/^Invalid arguments for typed_echo:/);
		const runtimeFail = await tool.runAsync({ text: "throw" }, makeContext());
		expect(runtimeFail.error).toBe("Error executing typed_echo: runtime-boom");
	});

	it("stringifies non-Error throws in generic envelope", async () => {
		const tool = createTool({
			name: "string_throw",
			description: "Throws a non-Error value",
			fn: () => {
				throw 404;
			},
		});
		const result = await tool.runAsync({}, makeContext());
		expect(result.error).toBe("Error executing string_throw: 404");
	});

	it("schema-less z.object({}) ignores unknown keys and still runs", async () => {
		const tool = createTool({
			name: "schema_less",
			description: "No explicit schema provided",
			fn: (args) => ({ keys: Object.keys(args).sort() }),
		});
		const result = await tool.runAsync(
			{ unexpected: true, also: 1 },
			makeContext(),
		);
		expect(result).toEqual({ keys: [] });
	});

	it("strips $schema from declaration parameters", () => {
		const tool = createTool({
			name: "schema_strip",
			description: "Strips schema meta field",
			schema: z.object({ n: z.number() }),
			fn: ({ n }) => ({ n }),
		});
		const declaration = tool.getDeclaration();
		expect((declaration?.parameters as any).$schema).toBeUndefined();
		expect(declaration?.parameters).toMatchObject({
			type: "object",
			properties: { n: { type: "number" } },
		});
	});

	it("supports async fn via Promise.resolve", async () => {
		const tool = createTool({
			name: "async_add",
			description: "Adds asynchronously",
			schema: z.object({ a: z.number(), b: z.number() }),
			fn: async ({ a, b }) => ({ sum: a + b }),
		});
		await expect(tool.runAsync({ a: 1, b: 2 }, makeContext())).resolves.toEqual(
			{ sum: 3 },
		);
	});

	it("forwards long-running and retry config onto BaseTool", () => {
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
});
