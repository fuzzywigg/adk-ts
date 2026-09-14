import { Type } from "@google/genai";
import { describe, expect, it } from "vitest";
import { FunctionTool } from "../../../tools/function/function-tool";
import { buildFunctionDeclaration } from "../../../tools/function/function-utils";
import type { ToolContext } from "../../../tools/tool-context";

function makeContext(): ToolContext {
	return { actions: {} } as ToolContext;
}

function withSource(
	impl: (...args: any[]) => any,
	source: string,
): (...args: any[]) => any {
	Object.defineProperty(impl, "toString", {
		value: () => source,
	});
	return impl;
}

describe("FunctionTool heavy matrix edges", () => {
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
		expect(tool.getDeclaration().parameters?.properties?.a?.type).toBe(
			"number",
		);
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
		await expect(
			tool.runAsync({ count: "3", enabled: "true" } as any, makeContext()),
		).resolves.toEqual({ count: 3, enabled: true, hasActions: true });
	});

	it("coerces FALSE boolean strings and leaves null untouched", async () => {
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

	it("wraps thrown errors with function name", async () => {
		function boom() {
			throw new Error("explode");
		}
		const tool = new FunctionTool(boom, { description: "Always explodes" });
		const result = await tool.runAsync({}, makeContext());
		expect(result.error).toContain("Error executing function boom: explode");
	});

	it("awaits async functions and honors custom name", async () => {
		async function doubleValue(n: number) {
			return { doubled: n * 2 };
		}
		const tool = new FunctionTool(doubleValue, {
			name: "double_tool",
			description: "Doubles a value asynchronously.",
			parameterTypes: { n: "number" as any },
		});
		expect(tool.name).toBe("double_tool");
		await expect(
			tool.runAsync({ n: "4" } as any, makeContext()),
		).resolves.toEqual({ doubled: 8 });
	});

	it("returns {} for sync and async falsy/undefined results", async () => {
		function syncUndef() {
			return undefined;
		}
		async function asyncUndef() {
			return undefined;
		}
		const syncTool = new FunctionTool(syncUndef, {
			description: "Sync noop",
			isLongRunning: true,
		});
		const asyncTool = new FunctionTool(asyncUndef, {
			description: "Async noop",
		});
		expect(syncTool.isLongRunning).toBe(true);
		await expect(syncTool.runAsync({}, makeContext())).resolves.toEqual({});
		await expect(asyncTool.runAsync({}, makeContext())).resolves.toEqual({});
	});

	it("treats context parameter as non-mandatory and does not auto-inject it", async () => {
		function withContext(value: string, context?: ToolContext) {
			return { value, hasContextParam: context !== undefined };
		}
		const tool = new FunctionTool(withContext, {
			description: "Uses context alias name",
		});
		const missing = await tool.runAsync({} as any, makeContext());
		expect(missing.error).toContain("value");
		expect(missing.error).not.toContain("context");
		await expect(tool.runAsync({ value: "x" }, makeContext())).resolves.toEqual(
			{ value: "x", hasContextParam: false },
		);
	});

	it("still runs when only the word context appears in the body", async () => {
		function echo(message: string) {
			return { message, contextMention: true };
		}
		const tool = new FunctionTool(echo, { description: "Echoes a message" });
		await expect(
			tool.runAsync({ message: "hi" }, makeContext()),
		).resolves.toEqual({ message: "hi", contextMention: true });
		expect(
			tool.getDeclaration().parameters?.properties?.toolContext,
		).toBeUndefined();
	});

	it("coerces number strings including floats and zero", async () => {
		function nums(a: number, b: number) {
			return { a, b };
		}
		const tool = new FunctionTool(nums, {
			description: "Number coerce",
			parameterTypes: { a: "number" as any, b: "number" as any },
		});
		await expect(
			tool.runAsync({ a: "0", b: "3.5" } as any, makeContext()),
		).resolves.toEqual({ a: 0, b: 3.5 });
	});

	it("coerces boolean strings true/false case-insensitively", async () => {
		function flags(a: boolean, b: boolean) {
			return { a, b };
		}
		const tool = new FunctionTool(flags, {
			description: "Bool coerce",
			parameterTypes: { a: "boolean" as any, b: "boolean" as any },
		});
		await expect(
			tool.runAsync({ a: "True", b: "false" } as any, makeContext()),
		).resolves.toEqual({ a: true, b: false });
	});

	it("leaves already-typed args untouched", async () => {
		function pass(n: number, s: string, f: boolean) {
			return { n, s, f };
		}
		const tool = new FunctionTool(pass, {
			description: "Pass through",
			parameterTypes: {
				n: "number" as any,
				s: "string" as any,
				f: "boolean" as any,
			},
		});
		await expect(
			tool.runAsync({ n: 1, s: "x", f: false }, makeContext()),
		).resolves.toEqual({ n: 1, s: "x", f: false });
	});

	it("stringifies objects for string params", async () => {
		function label(name: string) {
			return { name };
		}
		const tool = new FunctionTool(label, {
			description: "Object stringify",
			parameterTypes: { name: "string" as any },
		});
		const result = await tool.runAsync(
			{ name: { a: 1 } } as any,
			makeContext(),
		);
		expect(result.name).toContain("[object Object]");
	});

	it("buildFunctionDeclaration uses name and empty params for parameterless", () => {
		function greet() {
			return "hi";
		}
		const declaration = buildFunctionDeclaration(greet);
		expect(declaration.name).toBe("greet");
		expect(declaration.parameters).toEqual({
			type: Type.OBJECT,
			properties: {},
		});
	});

	it("buildFunctionDeclaration allows name and description overrides", () => {
		function greet() {
			return "hi";
		}
		const declaration = buildFunctionDeclaration(greet, {
			name: "say_hello",
			description: "Says hello",
		});
		expect(declaration.name).toBe("say_hello");
		expect(declaration.description).toBe("Says hello");
	});

	it("buildFunctionDeclaration marks required params from typescript types", () => {
		const configure = withSource(
			(_count: number, _enabled: boolean, _label = "x") => ({}),
			'function configure(count: number, enabled: boolean, label: string = "x") { return {}; }',
		);
		Object.defineProperty(configure, "name", { value: "configure" });
		const declaration = buildFunctionDeclaration(configure);
		expect(declaration.parameters?.required).toEqual(["count", "enabled"]);
		expect(declaration.parameters?.properties?.count?.type).toBe("number");
		expect(declaration.parameters?.required).not.toContain("label");
	});

	it("buildFunctionDeclaration ignores listed params and reads JSDoc", () => {
		const lookup = withSource(
			(_id: number, _toolContext?: unknown) => 1,
			`/**
 * Looks up a user
 * @param {number} id User identifier
 * @param {string} toolContext Injected context
 */
function lookup(id, toolContext) { return id; }`,
		);
		Object.defineProperty(lookup, "name", { value: "lookup" });
		const declaration = buildFunctionDeclaration(lookup, {
			ignoreParams: ["toolContext"],
		});
		expect(declaration.description).toContain("Looks up a user");
		expect(declaration.parameters?.properties?.id?.type).toBe("number");
		expect(declaration.parameters?.properties?.toolContext).toBeUndefined();
	});

	it("buildFunctionDeclaration defaults unknown typescript types to string", () => {
		const cast = withSource(
			(_value: unknown) => _value,
			"function cast(value: CustomType) { return value; }",
		);
		Object.defineProperty(cast, "name", { value: "cast" });
		expect(
			buildFunctionDeclaration(cast).parameters?.properties?.value?.type,
		).toBe("string");
	});

	it("buildFunctionDeclaration maps JSDoc array/object/boolean/null types", () => {
		const shaped = withSource(
			(_items: unknown, _meta: unknown, _flag: unknown, _n: unknown) => ({}),
			`/**
 * Shapes values
 * @param {array} items List
 * @param {object} meta Meta
 * @param {boolean} flag Toggle
 * @param {null} n Nullable
 */
function shaped(items, meta, flag, n) { return {}; }`,
		);
		Object.defineProperty(shaped, "name", { value: "shaped" });
		const declaration = buildFunctionDeclaration(shaped);
		expect(declaration.parameters?.properties?.items?.type).toBe("array");
		expect(declaration.parameters?.properties?.meta?.type).toBe("object");
		expect(declaration.parameters?.properties?.flag?.type).toBe("boolean");
		expect(declaration.parameters?.properties?.n?.type).toBe("null");
	});

	it("buildFunctionDeclaration returns empty properties on bad signatures", () => {
		const broken = withSource(() => 1, "not a function signature");
		Object.defineProperty(broken, "name", { value: "broken" });
		expect(buildFunctionDeclaration(broken).parameters).toEqual({
			type: Type.OBJECT,
			properties: {},
		});
	});

	it("FunctionTool reports multiple missing mandatory params", async () => {
		function multi(a: string, b: number, c: boolean) {
			return { a, b, c };
		}
		const tool = new FunctionTool(multi, {
			description: "Multi required",
			parameterTypes: {
				a: "string" as any,
				b: "number" as any,
				c: "boolean" as any,
			},
		});
		const result = await tool.runAsync({} as any, makeContext());
		expect(result.error).toContain("a");
		expect(result.error).toContain("b");
		expect(result.error).toContain("c");
	});

	it("normalizes sync falsy returns of 0 and false to {}", async () => {
		function zeros() {
			return 0;
		}
		function falsy() {
			return false;
		}
		const z = new FunctionTool(zeros, { description: "Returns zero" });
		const f = new FunctionTool(falsy, { description: "Returns false" });
		await expect(z.runAsync({}, makeContext())).resolves.toEqual({});
		await expect(f.runAsync({}, makeContext())).resolves.toEqual({});
	});

	it("FunctionTool wraps non-Error throws via String()", async () => {
		function boom() {
			throw "string-throw";
		}
		const tool = new FunctionTool(boom, { description: "Throws string" });
		const result = await tool.runAsync({}, makeContext());
		expect(result.error).toContain("string-throw");
	});

	it("optional params with defaults are not mandatory", async () => {
		function maybe(id = "default") {
			return { id };
		}
		const tool = new FunctionTool(maybe, { description: "Optional id" });
		await expect(tool.runAsync({}, makeContext())).resolves.toEqual({
			id: "default",
		});
	});

	it("parameterTypes override inferred declaration types", () => {
		function typed(value: any) {
			return value;
		}
		const tool = new FunctionTool(typed, {
			description: "Override types",
			parameterTypes: { value: "number" as any },
		});
		expect(tool.getDeclaration().parameters?.properties?.value?.type).toBe(
			"number",
		);
	});

	it("async rejection is wrapped as error envelope", async () => {
		async function fail() {
			await Promise.resolve();
			throw new Error("async boom");
		}
		const tool = new FunctionTool(fail, { description: "Async fail" });
		const result = await tool.runAsync({}, makeContext());
		expect(result.error).toContain("async boom");
	});

	it("buildFunctionDeclaration parses optional parameters with defaults as non-required", () => {
		const maybe = withSource(
			(_id: string | undefined = undefined) => _id,
			"function maybe(id: string = undefined) { return id; }",
		);
		Object.defineProperty(maybe, "name", { value: "maybe" });
		const declaration = buildFunctionDeclaration(maybe);
		expect(declaration.parameters?.required || []).not.toContain("id");
	});

	it("toolContext is injected and excluded from declaration properties", async () => {
		function withToolContext(msg: string, toolContext: ToolContext) {
			return { msg, has: Boolean(toolContext) };
		}
		const tool = new FunctionTool(withToolContext, {
			description: "Injects toolContext",
		});
		expect(
			tool.getDeclaration().parameters?.properties?.toolContext,
		).toBeUndefined();
		await expect(tool.runAsync({ msg: "hi" }, makeContext())).resolves.toEqual({
			msg: "hi",
			has: true,
		});
	});
});
