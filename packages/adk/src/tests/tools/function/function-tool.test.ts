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

	it("extracts JSDoc description when options.description is omitted", () => {
		const documented = Object.assign(function documentedTool(x: string) {
			return { x };
		}, {});
		Object.defineProperty(documented, "toString", {
			value: () => `/**
 * Documented helper from JSDoc
 */
function documentedTool(x) { return { x }; }`,
		});
		Object.defineProperty(documented, "name", { value: "documentedTool" });

		const tool = new FunctionTool(documented);
		expect(tool.description).toContain("Documented helper from JSDoc");
	});

	it("wires shouldRetryOnFailure and maxRetryAttempts from constructor options", () => {
		function ping() {
			return { ok: true };
		}
		const tool = new FunctionTool(ping, {
			description: "Ping tool",
			shouldRetryOnFailure: true,
			maxRetryAttempts: 9,
		});
		expect(tool.shouldRetryOnFailure).toBe(true);
		expect(tool.maxRetryAttempts).toBe(9);
	});

	it("leaves non-numeric strings and non-numbers unchanged for number params", async () => {
		function take(n: number) {
			return { n };
		}
		const tool = new FunctionTool(take, {
			description: "Number coercion edges",
			parameterTypes: { n: "number" as any },
		});

		await expect(
			tool.runAsync({ n: "abc" } as any, makeContext()),
		).resolves.toEqual({ n: "abc" });
		await expect(
			tool.runAsync({ n: 7 } as any, makeContext()),
		).resolves.toEqual({ n: 7 });
	});

	it("leaves non-string/non-boolean values unchanged for boolean params", async () => {
		function take(flag: boolean) {
			return { flag };
		}
		const tool = new FunctionTool(take, {
			description: "Boolean coercion edges",
			parameterTypes: { flag: "boolean" as any },
		});

		await expect(
			tool.runAsync({ flag: 1 } as any, makeContext()),
		).resolves.toEqual({ flag: 1 });
		await expect(
			tool.runAsync({ flag: false } as any, makeContext()),
		).resolves.toEqual({ flag: false });
	});

	it("returns complex/unknown parameterTypes values as-is", async () => {
		const passMeta = (() => {
			const impl = (...args: any[]) => ({ meta: args[0] });
			Object.defineProperty(impl, "toString", {
				value: () => "function passMeta(meta) { return { meta }; }",
			});
			Object.defineProperty(impl, "name", { value: "passMeta" });
			return impl;
		})();

		const tool = new FunctionTool(passMeta, {
			description: "Object param",
			parameterTypes: { meta: "object" as any },
		});
		const meta = { a: 1 };
		await expect(
			tool.runAsync({ meta } as any, makeContext()),
		).resolves.toEqual({ meta });
	});

	it("falls back to declaration schema types when parameterTypes omitted", async () => {
		const typed = Object.assign(function typed(count: number) {
			return { count };
		}, {});
		Object.defineProperty(typed, "toString", {
			value: () => "function typed(count: number) { return { count }; }",
		});
		Object.defineProperty(typed, "name", { value: "typed" });

		const tool = new FunctionTool(typed, { description: "Uses TS annotation" });
		await expect(
			tool.runAsync({ count: "5" } as any, makeContext()),
		).resolves.toEqual({ count: 5 });
	});

	it("defaults coercion to string when no type can be inferred", async () => {
		const bare = Object.assign(function bare(value) {
			return { value };
		}, {});
		Object.defineProperty(bare, "toString", {
			value: () => "function bare(value) { return { value }; }",
		});
		Object.defineProperty(bare, "name", { value: "bare" });

		const tool = new FunctionTool(bare, { description: "No type info" });
		await expect(
			tool.runAsync({ value: 99 } as any, makeContext()),
		).resolves.toEqual({ value: "99" });
	});

	it("does not require parameters that have defaults", async () => {
		const withDefault = Object.assign(function withDefault(label = "x") {
			return { label };
		}, {});
		Object.defineProperty(withDefault, "toString", {
			value: () => 'function withDefault(label = "x") { return { label }; }',
		});
		Object.defineProperty(withDefault, "name", { value: "withDefault" });

		const tool = new FunctionTool(withDefault, {
			description: "Optional via default",
		});
		await expect(tool.runAsync({} as any, makeContext())).resolves.toEqual({
			label: "x",
		});
	});

	it("returns empty mandatory/params when toString has no parameter list", async () => {
		const broken = Object.assign(function broken() {
			return {};
		}, {});
		Object.defineProperty(broken, "toString", {
			value: () => "not a callable signature",
		});
		Object.defineProperty(broken, "name", { value: "broken" });

		const tool = new FunctionTool(broken, { description: "Broken signature" });
		await expect(tool.runAsync({}, makeContext())).resolves.toEqual({});
		expect(tool.getDeclaration().parameters).toEqual({
			type: expect.anything(),
			properties: {},
		});
	});

	it("stringifies non-Error throws in the runAsync error envelope", async () => {
		function boom() {
			throw "plain failure";
		}
		const tool = new FunctionTool(boom, { description: "Throws a string" });
		const result = await tool.runAsync({}, makeContext());
		expect(result.error).toContain(
			"Error executing function boom: plain failure",
		);
	});

	it("ignores parameterTypes keys that are not in the declaration", () => {
		function add(a: number, b: number) {
			return { sum: a + b };
		}
		const tool = new FunctionTool(add, {
			description: "Adds",
			parameterTypes: {
				a: "number" as any,
				ghost: "number" as any,
			},
		});
		const declaration = tool.getDeclaration();
		expect(declaration.parameters?.properties?.a?.type).toBe("number");
		expect(declaration.parameters?.properties?.ghost).toBeUndefined();
	});

	it("pushes undefined for optional named params missing from args", async () => {
		const optionalMiddle = Object.assign(function optionalMiddle(
			a: string,
			b = "fallback",
			c = "tail",
		) {
			return { a, b, c };
		}, {});
		Object.defineProperty(optionalMiddle, "toString", {
			value: () =>
				'function optionalMiddle(a, b = "fallback", c = "tail") { return { a, b, c }; }',
		});
		Object.defineProperty(optionalMiddle, "name", { value: "optionalMiddle" });

		const tool = new FunctionTool(optionalMiddle, {
			description: "Optional middle params",
		});
		await expect(
			tool.runAsync({ a: "first", c: "custom" } as any, makeContext()),
		).resolves.toEqual({ a: "first", b: "fallback", c: "custom" });
	});

	it("reports multiple missing mandatory args joined by newlines", async () => {
		function pair(left: string, right: string) {
			return { left, right };
		}
		const tool = new FunctionTool(pair, { description: "Needs both" });
		const result = await tool.runAsync({} as any, makeContext());
		expect(result.error).toContain("left");
		expect(result.error).toContain("right");
		expect(result.error).toMatch(/left\nright|left\r?\nright/);
	});
});
