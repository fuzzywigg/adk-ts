import Module from "node:module";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createFunctionTool } from "../../../tools/function";
import * as functionToolModule from "../../../tools/function/function-tool";
import { FunctionTool } from "../../../tools/function/function-tool";
import type { ToolContext } from "../../../tools/tool-context";

/**
 * createFunctionTool uses CJS require("./function-tool") without an extension.
 * Under Vitest's TypeScript ESM runner that relative id does not resolve, so
 * we map it to the already-loaded ESM module namespace for this suite only.
 */
const originalRequire = Module.prototype.require;
beforeAll(() => {
	Module.prototype.require = function (
		this: NodeModule,
		id: string,
		...rest: unknown[]
	) {
		if (id === "./function-tool" || id === "./function-tool.js") {
			return functionToolModule;
		}
		return originalRequire.apply(this, [id, ...rest] as [string]);
	} as typeof Module.prototype.require;
});

afterAll(() => {
	Module.prototype.require = originalRequire;
});

function makeContext(): ToolContext {
	return { actions: {} } as ToolContext;
}

describe("createFunctionTool factory", () => {
	it("wraps a named function and derives the tool name from func.name", async () => {
		function add(a: number, b: number) {
			return { sum: a + b };
		}

		const tool = createFunctionTool(add, {
			description: "Adds two numbers together",
			parameterTypes: { a: "number" as any, b: "number" as any },
		} as any);

		expect(tool).toBeInstanceOf(FunctionTool);
		expect(tool.name).toBe("add");
		expect(tool.description).toBe("Adds two numbers together");
		await expect(tool.runAsync({ a: 2, b: 3 }, makeContext())).resolves.toEqual(
			{ sum: 5 },
		);
	});

	it("supports anonymous arrow functions with an explicit options.name", async () => {
		const anonymous = (value: string) => ({ echoed: value });
		Object.defineProperty(anonymous, "name", { value: "" });

		const tool = createFunctionTool(anonymous, {
			name: "echo_anon",
			description: "Echoes a string value from anonymous fn",
		});

		expect(tool.name).toBe("echo_anon");
		await expect(
			tool.runAsync({ value: "hi" }, makeContext()),
		).resolves.toEqual({ echoed: "hi" });
	});

	it("forwards isLongRunning, shouldRetryOnFailure, and maxRetryAttempts", () => {
		function ping() {
			return "pong";
		}

		const tool = createFunctionTool(ping, {
			description: "Ping tool with retry metadata",
			isLongRunning: true,
			shouldRetryOnFailure: true,
			maxRetryAttempts: 9,
		});

		expect(tool.isLongRunning).toBe(true);
		expect(tool.shouldRetryOnFailure).toBe(true);
		expect(tool.maxRetryAttempts).toBe(9);
	});

	it("falls back maxRetryAttempts 0 to 3 via options || semantics", () => {
		function ping() {
			return "pong";
		}

		const tool = createFunctionTool(ping, {
			description: "Ping with falsy maxRetryAttempts",
			maxRetryAttempts: 0,
		});

		expect(tool.maxRetryAttempts).toBe(3);
		expect(tool.shouldRetryOnFailure).toBe(false);
		expect(tool.isLongRunning).toBe(false);
	});

	it("treats shouldRetryOnFailure false and omitted as false", () => {
		function ping() {
			return "pong";
		}

		const explicit = createFunctionTool(ping, {
			description: "Explicit false retry flag",
			shouldRetryOnFailure: false,
		});
		const omitted = createFunctionTool(ping, {
			description: "Omitted retry flag defaults",
		});

		expect(explicit.shouldRetryOnFailure).toBe(false);
		expect(omitted.shouldRetryOnFailure).toBe(false);
	});

	it("runAsync succeeds for sync functions created via the factory", async () => {
		function greet(name: string) {
			return { greeting: `hello ${name}` };
		}

		const tool = createFunctionTool(greet, {
			description: "Greets a named user",
		});

		await expect(
			tool.runAsync({ name: "ada" }, makeContext()),
		).resolves.toEqual({ greeting: "hello ada" });
	});

	it("runAsync succeeds for async functions created via the factory", async () => {
		async function doubleValue(n: number) {
			return { doubled: n * 2 };
		}

		const tool = createFunctionTool(doubleValue, {
			name: "double_async",
			description: "Doubles a numeric value asynchronously",
			parameterTypes: { n: "number" as any },
		} as any);

		await expect(
			tool.runAsync({ n: "7" } as any, makeContext()),
		).resolves.toEqual({ doubled: 14 });
	});

	it("runAsync returns an error envelope when the wrapped function throws", async () => {
		function boom() {
			throw new Error("factory boom");
		}

		const tool = createFunctionTool(boom, {
			name: "boom_tool",
			description: "Always throws from the wrapped function",
		});

		const result = await tool.runAsync({}, makeContext());
		expect(result.error).toContain(
			"Error executing function boom_tool: factory boom",
		);
	});

	it("runAsync returns an error envelope for non-Error throws", async () => {
		function throwString() {
			throw "string-fail";
		}

		const tool = createFunctionTool(throwString, {
			name: "string_throw",
			description: "Throws a string instead of Error",
		});

		const result = await tool.runAsync({}, makeContext());
		expect(result.error).toContain(
			"Error executing function string_throw: string-fail",
		);
	});

	it("reports missing mandatory args through the factory-created tool", async () => {
		function needsName(name: string) {
			return name;
		}

		const tool = createFunctionTool(needsName, {
			description: "Requires a name argument",
		});

		const result = await tool.runAsync({} as any, makeContext());
		expect(result.error).toContain("mandatory input parameters");
		expect(result.error).toContain("name");
	});

	it("overrides func.name when options.name is provided", () => {
		function originalName() {
			return "ok";
		}

		const tool = createFunctionTool(originalName, {
			name: "renamed_tool",
			description: "Renamed via createFunctionTool options",
		});

		expect(tool.name).toBe("renamed_tool");
		expect(tool.getDeclaration().name).toBe("renamed_tool");
	});

	it("forwards empty description only when options.description is long enough", () => {
		function labeled() {
			return "x";
		}

		const tool = createFunctionTool(labeled, {
			description: "A valid description for BaseTool",
		});
		expect(tool.description).toBe("A valid description for BaseTool");
	});

	it("rejects factory creation when description is too short for BaseTool", () => {
		function bare() {
			return "x";
		}

		expect(() => createFunctionTool(bare, { description: "ab" })).toThrow(
			/too short/i,
		);
	});

	it("returns {} when the wrapped sync function returns falsy", async () => {
		function noop() {
			return undefined;
		}

		const tool = createFunctionTool(noop, {
			description: "Sync noop returning undefined",
		});

		await expect(tool.runAsync({}, makeContext())).resolves.toEqual({});
	});

	it("returns {} when the wrapped async function returns falsy", async () => {
		async function asyncNoop() {
			return null;
		}

		const tool = createFunctionTool(asyncNoop, {
			description: "Async noop returning null",
		});

		await expect(tool.runAsync({}, makeContext())).resolves.toEqual({});
	});

	it("injects toolContext when the wrapped function accepts it", async () => {
		function withCtx(value: string, toolContext: ToolContext) {
			return {
				value,
				hasActions: Boolean(toolContext?.actions),
			};
		}

		const tool = createFunctionTool(withCtx, {
			description: "Uses toolContext from factory",
		});

		await expect(tool.runAsync({ value: "v" }, makeContext())).resolves.toEqual(
			{ value: "v", hasActions: true },
		);
	});

	it("coerces number and boolean args when parameterTypes are forwarded", async () => {
		function inspect(count: number, enabled: boolean) {
			return { count, enabled, countType: typeof count };
		}

		const tool = createFunctionTool(inspect, {
			description: "Coerces primitives via parameterTypes",
			parameterTypes: {
				count: "number" as any,
				enabled: "boolean" as any,
			},
		} as any);

		await expect(
			tool.runAsync({ count: "5", enabled: "true" } as any, makeContext()),
		).resolves.toEqual({ count: 5, enabled: true, countType: "number" });
	});

	it("builds a declaration that mirrors the wrapped function signature", () => {
		function search(query: string, limit: number) {
			return { query, limit };
		}

		const tool = createFunctionTool(search, {
			description: "Searches with query and limit",
			parameterTypes: {
				query: "string" as any,
				limit: "number" as any,
			},
		} as any);

		const declaration = tool.getDeclaration();
		expect(declaration.name).toBe("search");
		expect(declaration.description).toContain("Searches with query");
		expect(declaration.parameters?.properties?.query).toBeDefined();
		expect(declaration.parameters?.properties?.limit).toBeDefined();
	});

	it("creates independent tool instances for the same function", async () => {
		function shared(x: number) {
			return { x };
		}

		const a = createFunctionTool(shared, {
			name: "shared_a",
			description: "First factory instance of shared",
			parameterTypes: { x: "number" as any },
		} as any);
		const b = createFunctionTool(shared, {
			name: "shared_b",
			description: "Second factory instance of shared",
			parameterTypes: { x: "number" as any },
		} as any);

		expect(a).not.toBe(b);
		expect(a.name).toBe("shared_a");
		expect(b.name).toBe("shared_b");
		await expect(a.runAsync({ x: 1 }, makeContext())).resolves.toEqual({
			x: 1,
		});
		await expect(b.runAsync({ x: 2 }, makeContext())).resolves.toEqual({
			x: 2,
		});
	});

	it("honors isLongRunning false explicitly alongside retry defaults", () => {
		function ping() {
			return "pong";
		}

		const tool = createFunctionTool(ping, {
			description: "Explicit long-running false",
			isLongRunning: false,
			shouldRetryOnFailure: true,
			maxRetryAttempts: 1,
		});

		expect(tool.isLongRunning).toBe(false);
		expect(tool.shouldRetryOnFailure).toBe(true);
		expect(tool.maxRetryAttempts).toBe(1);
	});

	it("stringifies non-string values for string parameters", async () => {
		function label(name: string) {
			return { name };
		}

		const tool = createFunctionTool(label, {
			description: "Stringifies name parameter",
			parameterTypes: { name: "string" as any },
		} as any);

		await expect(
			tool.runAsync({ name: 99 } as any, makeContext()),
		).resolves.toEqual({ name: "99" });
	});

	it("pulls JSDoc description when options.description is omitted", () => {
		function greetJsDoc(name: string) {
			return `hi ${name}`;
		}
		Object.defineProperty(greetJsDoc, "toString", {
			value: () =>
				`/**\n * Greets via createFunctionTool JSDoc.\n */\nfunction greetJsDoc(name) { return "hi " + name; }`,
		});

		const tool = createFunctionTool(greetJsDoc);
		expect(tool.description).toContain("Greets via createFunctionTool JSDoc");
	});

	it("safeExecute path succeeds through BaseTool when factory tool runs", async () => {
		function ok() {
			return { ok: true };
		}

		const tool = createFunctionTool(ok, {
			description: "Safe execute success path",
		});

		await expect(tool.safeExecute({}, makeContext())).resolves.toEqual({
			result: { ok: true },
		});
	});

	it("safeExecute surfaces FunctionTool error envelopes inside result", async () => {
		function fail() {
			throw new Error("safe fail");
		}

		const tool = createFunctionTool(fail, {
			name: "safe_fail",
			description: "Safe execute error path",
		});

		const result = await tool.safeExecute({}, makeContext());
		expect(result).toMatchObject({
			result: {
				error: expect.stringContaining("safe fail"),
			},
		});
	});

	it("forwards all option keys together without dropping any", () => {
		function combo(a: number) {
			return { a };
		}

		const tool = createFunctionTool(combo, {
			name: "combo_tool",
			description: "All options forwarded together",
			isLongRunning: true,
			shouldRetryOnFailure: true,
			maxRetryAttempts: 4,
		});

		expect(tool.name).toBe("combo_tool");
		expect(tool.description).toBe("All options forwarded together");
		expect(tool.isLongRunning).toBe(true);
		expect(tool.shouldRetryOnFailure).toBe(true);
		expect(tool.maxRetryAttempts).toBe(4);
	});

	it("maxRetryAttempts undefined falls back to 3", () => {
		function ping() {
			return "pong";
		}

		const tool = createFunctionTool(ping, {
			description: "Undefined maxRetryAttempts",
			maxRetryAttempts: undefined,
		});

		expect(tool.maxRetryAttempts).toBe(3);
	});

	it("treats shouldRetryOnFailure undefined as false", () => {
		function ping() {
			return "pong";
		}

		const tool = createFunctionTool(ping, {
			description: "Undefined shouldRetryOnFailure",
			shouldRetryOnFailure: undefined,
		});

		expect(tool.shouldRetryOnFailure).toBe(false);
	});

	it("runAsync with multiple mandatory missing args lists all of them", async () => {
		function multi(a: string, b: string, c: string) {
			return { a, b, c };
		}

		const tool = createFunctionTool(multi, {
			description: "Requires three mandatory string args",
		});

		const result = await tool.runAsync({} as any, makeContext());
		expect(result.error).toContain("a");
		expect(result.error).toContain("b");
		expect(result.error).toContain("c");
	});

	it("creates a usable tool from a method-style function reference", async () => {
		const api = {
			fetchItem(id: string) {
				return { id, ok: true };
			},
		};

		const tool = createFunctionTool((id: string) => api.fetchItem(id), {
			name: "fetch_item",
			description: "Fetches an item by id via method-style wrapper",
		});

		expect(tool.name).toBe("fetch_item");
		await expect(tool.runAsync({ id: "42" }, makeContext())).resolves.toEqual({
			id: "42",
			ok: true,
		});
	});

	it("bound native methods lack parseable params so args are not forwarded", async () => {
		const api = {
			fetchItem(id: string) {
				return { id, ok: true };
			},
		};
		const bound = api.fetchItem.bind(api);
		const tool = createFunctionTool(bound, {
			name: "bound_fetch",
			description: "Bound method with native toString",
		});

		const result = await tool.runAsync({ id: "42" }, makeContext());
		expect(result).toEqual({ id: undefined, ok: true });
	});

	it("preserves custom name on anonymous async functions", async () => {
		const anonAsync = async (n: number) => ({ n: n + 1 });
		Object.defineProperty(anonAsync, "name", { value: "" });

		const tool = createFunctionTool(anonAsync, {
			name: "anon_async_inc",
			description: "Anonymous async incrementer",
			parameterTypes: { n: "number" as any },
		} as any);

		expect(tool.name).toBe("anon_async_inc");
		await expect(
			tool.runAsync({ n: "10" } as any, makeContext()),
		).resolves.toEqual({ n: 11 });
	});

	it("does not mutate the original function when creating the tool", async () => {
		function identity(x: string) {
			return x;
		}

		const before = identity.toString();
		const tool = createFunctionTool(identity, {
			name: "identity_tool",
			description: "Does not mutate the original function",
		});

		expect(identity.toString()).toBe(before);
		expect(identity.name).toBe("identity");
		expect(tool.name).toBe("identity_tool");
		await expect(tool.runAsync({ x: "keep" }, makeContext())).resolves.toBe(
			"keep",
		);
	});
});

describe("createFunctionTool retry option matrix", () => {
	const cases: Array<{
		label: string;
		options: {
			shouldRetryOnFailure?: boolean;
			maxRetryAttempts?: number;
		};
		expectedRetry: boolean;
		expectedMax: number;
	}> = [
		{
			label: "both omitted",
			options: {},
			expectedRetry: false,
			expectedMax: 3,
		},
		{
			label: "retry true max 1",
			options: { shouldRetryOnFailure: true, maxRetryAttempts: 1 },
			expectedRetry: true,
			expectedMax: 1,
		},
		{
			label: "retry true max 0 falls back",
			options: { shouldRetryOnFailure: true, maxRetryAttempts: 0 },
			expectedRetry: true,
			expectedMax: 3,
		},
		{
			label: "retry false max 5",
			options: { shouldRetryOnFailure: false, maxRetryAttempts: 5 },
			expectedRetry: false,
			expectedMax: 5,
		},
		{
			label: "retry true max undefined",
			options: { shouldRetryOnFailure: true },
			expectedRetry: true,
			expectedMax: 3,
		},
	];

	for (const c of cases) {
		it(`maps options for ${c.label}`, () => {
			function ping() {
				return "pong";
			}

			const tool = createFunctionTool(ping, {
				description: `Retry matrix case: ${c.label}`,
				...c.options,
			});

			expect(tool.shouldRetryOnFailure).toBe(c.expectedRetry);
			expect(tool.maxRetryAttempts).toBe(c.expectedMax);
		});
	}
});

describe("createFunctionTool runAsync error variants", () => {
	it("includes tool name in error when Error is thrown", async () => {
		const tool = createFunctionTool(
			() => {
				throw new Error("nested");
			},
			{ name: "nested_err", description: "Throws nested Error" },
		);

		const result = await tool.runAsync({}, makeContext());
		expect(result.error).toMatch(/nested_err/);
		expect(result.error).toMatch(/nested/);
	});

	it("stringifies object throws", async () => {
		const tool = createFunctionTool(
			() => {
				throw { code: 500, msg: "fail" };
			},
			{ name: "obj_throw", description: "Throws a plain object" },
		);

		const result = await tool.runAsync({}, makeContext());
		expect(result.error).toContain("obj_throw");
		expect(result.error).toContain("[object Object]");
	});

	it("stringifies number throws", async () => {
		const tool = createFunctionTool(
			() => {
				throw 404;
			},
			{ name: "num_throw", description: "Throws a number" },
		);

		const result = await tool.runAsync({}, makeContext());
		expect(result.error).toContain("404");
	});

	it("async rejection is caught and returned as error envelope", async () => {
		const tool = createFunctionTool(
			async () => {
				throw new Error("async reject");
			},
			{ name: "async_reject", description: "Async function that rejects" },
		);

		const result = await tool.runAsync({}, makeContext());
		expect(result.error).toContain("async reject");
	});
});
