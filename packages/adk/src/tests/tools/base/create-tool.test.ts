import { describe, expect, it, vi } from "vitest";
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

	it("wraps Promise.reject failures from async fn", async () => {
		const tool = createTool({
			name: "reject_tool",
			description: "Rejects",
			fn: async () => {
				await Promise.reject(new Error("async-nope"));
			},
		});
		await expect(tool.runAsync({}, makeContext())).resolves.toEqual({
			error: "Error executing reject_tool: async-nope",
		});
	});

	it("stringifies non-Error Promise.reject reasons", async () => {
		const tool = createTool({
			name: "reject_obj",
			description: "Rejects object",
			fn: async () => Promise.reject({ reason: "x" }),
		});
		const result = await tool.runAsync({}, makeContext());
		expect(result.error).toContain("Error executing reject_obj:");
		expect(result.error).toContain("[object Object]");
	});

	it("returns richer Zod schemas in declarations and multi-issue validation errors", async () => {
		const tool = createTool({
			name: "rich_schema",
			description: "Rich zod",
			schema: z.object({
				tags: z.array(z.string()).describe("Tag list"),
				mode: z.enum(["fast", "safe"]).describe("Run mode"),
				count: z.number().optional().default(1),
				payload: z.union([
					z.object({ kind: z.literal("a"), a: z.string() }),
					z.object({ kind: z.literal("b"), b: z.number() }),
				]),
			}),
			fn: (args) => args,
		});

		const parameters = tool.getDeclaration()?.parameters as Record<string, any>;
		expect(parameters.$schema).toBeUndefined();
		expect(parameters.properties.tags).toMatchObject({
			type: "array",
			description: "Tag list",
		});
		expect(
			parameters.properties.mode.enum || parameters.properties.mode.anyOf,
		).toBeTruthy();

		const invalid = await tool.runAsync(
			{ tags: "nope", mode: "other", payload: { kind: "a" } },
			makeContext(),
		);
		expect(invalid.error).toContain("Invalid arguments for rich_schema");

		const valid = await tool.runAsync(
			{
				tags: ["x"],
				mode: "fast",
				payload: { kind: "b", b: 2 },
			},
			makeContext(),
		);
		expect(valid).toMatchObject({
			tags: ["x"],
			mode: "fast",
			count: 1,
			payload: { kind: "b", b: 2 },
		});
	});

	it("caches getDeclaration identity across calls", () => {
		const tool = createTool({
			name: "cached_decl",
			description: "Same object",
			schema: z.object({ n: z.number() }),
			fn: ({ n }) => ({ n }),
		});
		expect(tool.getDeclaration()).toBe(tool.getDeclaration());
	});

	it("combines long-running and retry flags with a schema tool", async () => {
		const tool = createTool({
			name: "schema_retry",
			description: "Schema + retries",
			schema: z.object({ value: z.string() }),
			fn: ({ value }) => ({ value }),
			isLongRunning: true,
			shouldRetryOnFailure: true,
			maxRetryAttempts: 4,
		});

		expect(tool.isLongRunning).toBe(true);
		expect(tool.shouldRetryOnFailure).toBe(true);
		expect(tool.maxRetryAttempts).toBe(4);
		await expect(
			tool.runAsync({ value: "ok" }, makeContext()),
		).resolves.toEqual({ value: "ok" });
		expect(tool.getDeclaration()?.parameters).toMatchObject({
			type: "object",
			properties: { value: { type: "string" } },
		});
	});

	it("includes top-level enum describe metadata in JSON schema", () => {
		const tool = createTool({
			name: "enum_tool",
			description: "Enum top-level",
			schema: z.object({
				color: z.enum(["red", "blue"]).describe("Favorite color"),
			}),
			fn: (args) => args,
		});
		const parameters = tool.getDeclaration()?.parameters as Record<string, any>;
		expect(parameters.$schema).toBeUndefined();
		expect(parameters.properties.color.description).toBe("Favorite color");
		expect(parameters.properties.color.enum).toEqual(["red", "blue"]);
	});

	it("supports array, record, and optional nullable fields in declarations", () => {
		const tool = createTool({
			name: "complex_shape",
			description: "Complex shape schema",
			schema: z.object({
				tags: z.array(z.string()).min(1),
				meta: z.record(z.string(), z.number()),
				note: z.string().nullable().optional(),
			}),
			fn: (args) => args,
		});

		const parameters = tool.getDeclaration()?.parameters as Record<string, any>;
		expect(parameters.$schema).toBeUndefined();
		expect(parameters.properties.tags.type).toBe("array");
		expect(parameters.properties.meta.type).toBe("object");
		expect(parameters.properties.note).toBeDefined();
	});

	it("returns ZodError envelope without invoking fn when parse fails", async () => {
		const fn = vi.fn(() => ({ ok: true }));
		const tool = createTool({
			name: "guarded",
			description: "Guards fn",
			schema: z.object({ n: z.number() }),
			fn,
		});

		const result = await tool.runAsync({ n: "nope" }, makeContext());
		expect(result.error).toContain("Invalid arguments for guarded");
		expect(fn).not.toHaveBeenCalled();
	});

	it("passes through large sync return values unchanged", async () => {
		const payload = { items: Array.from({ length: 50 }, (_, i) => i) };
		const tool = createTool({
			name: "big_payload",
			description: "Returns large payload",
			fn: () => payload,
		});
		await expect(tool.runAsync({}, makeContext())).resolves.toBe(payload);
	});

	it("supports z.string().url and z.email validation failures", async () => {
		const tool = createTool({
			name: "contact",
			description: "Contact info",
			schema: z.object({
				email: z.string().email(),
				site: z.string().url(),
			}),
			fn: (args) => args,
		});

		const bad = await tool.runAsync(
			{ email: "not-an-email", site: "also-bad" },
			makeContext(),
		);
		expect(bad.error).toContain("Invalid arguments for contact");

		const good = await tool.runAsync(
			{ email: "a@b.co", site: "https://example.com" },
			makeContext(),
		);
		expect(good).toEqual({ email: "a@b.co", site: "https://example.com" });
	});

	it("supports discriminated unions in schema and fn routing", async () => {
		const tool = createTool({
			name: "shape_union",
			description: "Discriminated union",
			schema: z.discriminatedUnion("kind", [
				z.object({ kind: z.literal("circle"), r: z.number() }),
				z.object({ kind: z.literal("rect"), w: z.number(), h: z.number() }),
			]),
			fn: (args) => {
				if (args.kind === "circle") {
					return { area: Math.PI * args.r * args.r };
				}
				return { area: args.w * args.h };
			},
		});

		await expect(
			tool.runAsync({ kind: "circle", r: 2 }, makeContext()),
		).resolves.toEqual({ area: Math.PI * 4 });
		await expect(
			tool.runAsync({ kind: "rect", w: 3, h: 4 }, makeContext()),
		).resolves.toEqual({ area: 12 });
		const invalid = await tool.runAsync(
			{ kind: "triangle", a: 1 } as any,
			makeContext(),
		);
		expect(invalid.error).toContain("Invalid arguments for shape_union");
	});

	it("applies zod transforms before invoking fn", async () => {
		const tool = createTool({
			name: "trim_tool",
			description: "Trims input",
			schema: z.object({
				name: z.string().trim().min(1),
			}),
			fn: ({ name }) => ({ name, length: name.length }),
		});

		await expect(
			tool.runAsync({ name: "  Ada  " }, makeContext()),
		).resolves.toEqual({ name: "Ada", length: 3 });
	});

	it("rejects invalid tool names via BaseTool constructor", () => {
		expect(() =>
			createTool({
				name: "bad-name!",
				description: "Invalid name",
				fn: () => ({}),
			}),
		).toThrow(/Invalid tool name/);
	});

	it("rejects short descriptions via BaseTool constructor", () => {
		expect(() =>
			createTool({
				name: "ok_name",
				description: "no",
				fn: () => ({}),
			}),
		).toThrow(/too short/);
	});

	it("works with safeExecute validation path for schema tools", async () => {
		const tool = createTool({
			name: "safe_schema",
			description: "Schema tool via safeExecute",
			schema: z.object({ q: z.string() }),
			fn: ({ q }) => ({ q }),
		});

		await expect(
			tool.safeExecute({ q: "hello" }, makeContext()),
		).resolves.toEqual({ result: { q: "hello" } });
	});

	it("safeExecute still wraps createTool results that return Zod error objects", async () => {
		const tool = createTool({
			name: "safe_invalid",
			description: "Invalid via runAsync inside safeExecute",
			schema: z.object({ q: z.string() }),
			fn: ({ q }) => ({ q }),
		});

		const result = await tool.safeExecute({ q: 1 } as any, makeContext());
		expect(result).toEqual({
			result: {
				error: expect.stringContaining("Invalid arguments for safe_invalid"),
			},
		});
	});

	it("supports recursive-looking nested objects without crashing declaration build", () => {
		const tool = createTool({
			name: "nested_deep",
			description: "Deep nesting",
			schema: z.object({
				level1: z.object({
					level2: z.object({
						level3: z.object({
							value: z.string(),
						}),
					}),
				}),
			}),
			fn: (args) => args,
		});
		const parameters = tool.getDeclaration()?.parameters as Record<string, any>;
		expect(
			parameters.properties.level1.properties.level2.properties.level3
				.properties.value.type,
		).toBe("string");
	});

	it("preserves literal number and boolean returns including NaN", async () => {
		const nanTool = createTool({
			name: "nan_tool",
			description: "Returns NaN",
			fn: () => Number.NaN,
		});
		const result = await nanTool.runAsync({}, makeContext());
		expect(Number.isNaN(result)).toBe(true);
	});

	it("invokes fn with empty object when schema is omitted and args are empty", async () => {
		let seen: Record<string, never> | undefined;
		const tool = createTool({
			name: "empty_args",
			description: "No schema args",
			fn: (args) => {
				seen = args;
				return { ok: true };
			},
		});
		await expect(tool.runAsync({}, makeContext())).resolves.toEqual({
			ok: true,
		});
		expect(seen).toEqual({});
	});

	it("builds declaration parameters with required fields from zod object", () => {
		const tool = createTool({
			name: "required_fields",
			description: "Required zod fields",
			schema: z.object({
				must: z.string(),
				maybe: z.string().optional(),
			}),
			fn: (args) => args,
		});
		const parameters = tool.getDeclaration()?.parameters as Record<string, any>;
		expect(parameters.required).toContain("must");
		expect(parameters.required || []).not.toContain("maybe");
	});

	it("handles async fn that returns nullish and coalesces to {}", async () => {
		const tool = createTool({
			name: "async_null",
			description: "Async null",
			fn: async () => null,
		});
		await expect(tool.runAsync({}, makeContext())).resolves.toEqual({});
	});

	it("surfaces Zod refine failures as invalid argument errors", async () => {
		const tool = createTool({
			name: "refine_tool",
			description: "Refine schema",
			schema: z
				.object({
					password: z.string(),
					confirm: z.string(),
				})
				.refine((data) => data.password === data.confirm, {
					message: "Passwords must match",
					path: ["confirm"],
				}),
			fn: (args) => args,
		});

		const result = await tool.runAsync(
			{ password: "a", confirm: "b" },
			makeContext(),
		);
		expect(result.error).toContain("Invalid arguments for refine_tool");
	});
});
