import { describe, expect, it } from "vitest";
import { FunctionTool } from "../../../tools/function/function-tool";
import type { ToolContext } from "../../../tools/tool-context";

function makeContext(): ToolContext {
	return { actions: {} } as ToolContext;
}

describe("FunctionTool", () => {
	it("runs sync functions and builds declarations", async () => {
		function add(a: number, b: number) {
			return { sum: a + b };
		}

		const tool = new FunctionTool(add, {
			description: "Adds numbers",
			parameterTypes: { a: "number" as any, b: "number" as any },
		});

		expect(tool.name).toBe("add");
		expect(await tool.runAsync({ a: 1, b: 2 }, makeContext())).toEqual({
			sum: 3,
		});

		const declaration = tool.getDeclaration();
		expect(declaration.name).toBe("add");
		expect(declaration.parameters?.properties?.a?.type).toBe("number");
	});

	it("reports missing mandatory args", async () => {
		function greet(name: string) {
			return `hello ${name}`;
		}

		const tool = new FunctionTool(greet, { description: "Greets a user" });
		const result = await tool.runAsync({} as any, makeContext());

		expect(result.error).toContain("mandatory input parameters");
		expect(result.error).toContain("name");
	});

	it("injects toolContext and coerces primitive types", async () => {
		function inspect(
			count: number,
			enabled: boolean,
			toolContext: ToolContext,
		) {
			return {
				count,
				enabled,
				hasActions: Boolean(toolContext.actions),
			};
		}

		const tool = new FunctionTool(inspect, {
			description: "Inspects coerced args",
			parameterTypes: {
				count: "number" as any,
				enabled: "boolean" as any,
			},
		});

		const result = await tool.runAsync(
			{ count: "3", enabled: "true" } as any,
			makeContext(),
		);

		expect(result).toEqual({
			count: 3,
			enabled: true,
			hasActions: true,
		});
	});

	it("wraps thrown errors", async () => {
		function boom() {
			throw new Error("explode");
		}

		const tool = new FunctionTool(boom, { description: "Always explodes" });
		const result = await tool.runAsync({}, makeContext());
		expect(result.error).toContain("Error executing function boom: explode");
	});

	it("awaits async functions and honors custom name plus description", async () => {
		async function doubleValue(n: number) {
			return { doubled: n * 2 };
		}

		const tool = new FunctionTool(doubleValue, {
			name: "double_tool",
			description: "Doubles a value asynchronously.",
			parameterTypes: { n: "number" as any },
		});

		expect(tool.name).toBe("double_tool");
		expect(tool.getDeclaration().description).toContain("Doubles a value");
		await expect(
			tool.runAsync({ n: "4" } as any, makeContext()),
		).resolves.toEqual({ doubled: 8 });
	});

	it("returns empty object when async function returns falsy", async () => {
		async function noop() {
			return undefined;
		}

		const tool = new FunctionTool(noop, {
			description: "Returns nothing useful",
		});
		await expect(tool.runAsync({}, makeContext())).resolves.toEqual({});
	});

	it("treats context parameter as non-mandatory tool context alias", async () => {
		function withContext(value: string, context?: ToolContext) {
			return {
				value,
				hasContextParam: context !== undefined,
			};
		}

		const tool = new FunctionTool(withContext, {
			description: "Uses context alias name",
		});

		const missing = await tool.runAsync({} as any, makeContext());
		expect(missing.error).toContain("value");
		expect(missing.error).not.toContain("context");
	});

	it("coerces falsey boolean strings and leaves null/undefined untouched", async () => {
		function inspect(enabled: boolean, maybe: string | null) {
			return { enabled, maybe };
		}

		const tool = new FunctionTool(inspect, {
			description: "Coercion edges",
			parameterTypes: {
				enabled: "boolean" as any,
				maybe: "string" as any,
			},
		});

		await expect(
			tool.runAsync({ enabled: "FALSE", maybe: null } as any, makeContext()),
		).resolves.toEqual({ enabled: false, maybe: null });

		await expect(
			tool.runAsync({ enabled: true, maybe: undefined } as any, makeContext()),
		).resolves.toEqual({ enabled: true, maybe: undefined });
	});

	it("honors isLongRunning and returns {} for sync falsy results", async () => {
		function noop() {
			return undefined;
		}

		const tool = new FunctionTool(noop, {
			name: "noop_tool",
			description: "Sync noop",
			isLongRunning: true,
		});

		expect(tool.name).toBe("noop_tool");
		expect(tool.isLongRunning).toBe(true);
		await expect(tool.runAsync({}, makeContext())).resolves.toEqual({});
	});

	it("stringifies non-string values for string parameters", async () => {
		function label(name: string) {
			return { name };
		}

		const tool = new FunctionTool(label, {
			description: "Stringify input",
			parameterTypes: { name: "string" as any },
		});

		await expect(
			tool.runAsync({ name: 42 } as any, makeContext()),
		).resolves.toEqual({ name: "42" });
	});

	it("pulls description from JSDoc when options.description is omitted", () => {
		function documented() {
			/**
			 * Documents the tool from JSDoc.
			 */
			return {};
		}
		Object.defineProperty(documented, "toString", {
			value: () => `/**
 * Documents the tool from JSDoc.
 */
function documented() { return {}; }`,
		});

		const tool = new FunctionTool(documented);
		expect(tool.description).toContain("Documents the tool from JSDoc");
	});

	it("honors shouldRetryOnFailure and maxRetryAttempts", () => {
		function ping() {
			return { ok: true };
		}

		const tool = new FunctionTool(ping, {
			description: "Retryable ping",
			shouldRetryOnFailure: true,
			maxRetryAttempts: 7,
		});

		expect(tool.shouldRetryOnFailure).toBe(true);
		expect(tool.maxRetryAttempts).toBe(7);
	});

	it("ignores parameterTypes keys that are not on the declaration", () => {
		function onlyA(a: number) {
			return { a };
		}

		const tool = new FunctionTool(onlyA, {
			description: "Only a",
			parameterTypes: {
				a: "number" as any,
				ghost: "boolean" as any,
			},
		});

		const declaration = tool.getDeclaration();
		expect(declaration.parameters?.properties?.a?.type).toBe("number");
		expect(declaration.parameters?.properties?.ghost).toBeUndefined();
	});

	it("passes through numbers and leaves non-numeric strings unchanged", async () => {
		function inspect(count: number) {
			return { count, typeofCount: typeof count };
		}

		const tool = new FunctionTool(inspect, {
			description: "Number coercion edges",
			parameterTypes: { count: "number" as any },
		});

		await expect(
			tool.runAsync({ count: 9 } as any, makeContext()),
		).resolves.toEqual({ count: 9, typeofCount: "number" });

		await expect(
			tool.runAsync({ count: "not-a-number" } as any, makeContext()),
		).resolves.toEqual({
			count: "not-a-number",
			typeofCount: "string",
		});
	});

	it("passes through boolean values without string coercion", async () => {
		function flag(enabled: boolean) {
			return { enabled };
		}

		const tool = new FunctionTool(flag, {
			description: "Boolean pass-through",
			parameterTypes: { enabled: "boolean" as any },
		});

		await expect(
			tool.runAsync({ enabled: false } as any, makeContext()),
		).resolves.toEqual({ enabled: false });
	});

	it("returns unknown-typed values unchanged", async () => {
		function echo(payload: unknown) {
			return { payload };
		}

		const tool = new FunctionTool(echo, {
			description: "Unknown type",
			parameterTypes: { payload: "object" as any },
		});

		const bag = { nested: true };
		await expect(
			tool.runAsync({ payload: bag } as any, makeContext()),
		).resolves.toEqual({ payload: bag });
	});

	it("coerces via declaration schema when parameterTypes is empty", async () => {
		const typed = Object.assign((count: number) => ({ count }), {
			toString: () => "function typed(count: number) { return { count }; }",
		});
		Object.defineProperty(typed, "name", { value: "typed" });

		const tool = new FunctionTool(typed, {
			description: "Schema-driven coercion",
		});

		await expect(
			tool.runAsync({ count: "11" } as any, makeContext()),
		).resolves.toEqual({ count: 11 });
	});

	it("stringifies non-Error throws in the catch path", async () => {
		function boom() {
			throw "raw-failure";
		}

		const tool = new FunctionTool(boom, { description: "Throws a string" });
		const result = await tool.runAsync({}, makeContext());
		expect(result.error).toContain(
			"Error executing function boom: raw-failure",
		);
	});

	it("excludes parameters with defaults from mandatory args", async () => {
		const greet = Object.assign(
			(name: string, greeting = "hello") => `${greeting} ${name}`,
			{
				toString: () =>
					'function greet(name, greeting = "hello") { return greeting + " " + name; }',
			},
		);
		Object.defineProperty(greet, "name", { value: "greet" });

		const tool = new FunctionTool(greet, { description: "Optional greeting" });
		const missing = await tool.runAsync({} as any, makeContext());
		expect(missing.error).toContain("name");
		expect(missing.error).not.toContain("greeting");

		await expect(
			tool.runAsync({ name: "Ada" } as any, makeContext()),
		).resolves.toBe("hello Ada");
	});

	it("rejects empty description when neither options nor JSDoc provide one", () => {
		function bare() {
			return {};
		}

		expect(() => new FunctionTool(bare)).toThrow(
			/Tool description for "bare" is too short/,
		);
	});

	it("defaults maxRetryAttempts to 3 when retry is enabled without a custom max", () => {
		function ping() {
			return { ok: true };
		}

		const tool = new FunctionTool(ping, {
			description: "Default retries",
			shouldRetryOnFailure: true,
		});

		expect(tool.shouldRetryOnFailure).toBe(true);
		expect(tool.maxRetryAttempts).toBe(3);
	});

	it("pushes undefined for optional trailing params omitted from args", async () => {
		const inspect = Object.assign(
			(a: string, b?: string) => ({ a, b, bDefined: b !== undefined }),
			{
				toString: () =>
					"function inspect(a, b = undefined) { return { a, b, bDefined: b !== undefined }; }",
			},
		);
		Object.defineProperty(inspect, "name", { value: "inspect" });

		const tool = new FunctionTool(inspect, {
			description: "Optional trailing param",
		});

		await expect(
			tool.runAsync({ a: "x" } as any, makeContext()),
		).resolves.toEqual({ a: "x", b: undefined, bDefined: false });
	});

	it("reports multiple missing mandatory args joined by newlines", async () => {
		function pair(left: string, right: string) {
			return { left, right };
		}

		const tool = new FunctionTool(pair, { description: "Needs both" });
		const result = await tool.runAsync({} as any, makeContext());

		expect(result.error).toContain("left");
		expect(result.error).toContain("right");
		expect(result.error).toMatch(/left\nright/);
	});
});
