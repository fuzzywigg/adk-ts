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

	it("still runs when only the word context appears in the function body", async () => {
		function echo(message: string) {
			// local context note should not break invocation
			return { message, contextMention: true };
		}

		const tool = new FunctionTool(echo, { description: "Echoes a message" });
		await expect(
			tool.runAsync({ message: "hi" }, makeContext()),
		).resolves.toEqual({ message: "hi", contextMention: true });
		expect(tool.getDeclaration().parameters?.properties?.message).toBeDefined();
		expect(
			tool.getDeclaration().parameters?.properties?.toolContext,
		).toBeUndefined();
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
		function greetJsDoc(name: string) {
			return `hi ${name}`;
		}
		Object.defineProperty(greetJsDoc, "toString", {
			value: () =>
				`/**\n * Greets someone warmly.\n */\nfunction greetJsDoc(name) { return "hi " + name; }`,
		});

		const tool = new FunctionTool(greetJsDoc);
		expect(tool.description).toContain("Greets someone warmly");
	});

	it("rejects empty descriptions shorter than BaseTool minimum length", () => {
		function bare(name: string) {
			return name;
		}

		expect(() => new FunctionTool(bare)).toThrow(/too short/i);
	});

	it("stores shouldRetryOnFailure and maxRetryAttempts from options", () => {
		function ping() {
			return "pong";
		}

		const tool = new FunctionTool(ping, {
			description: "ping",
			shouldRetryOnFailure: true,
			maxRetryAttempts: 7,
		});

		expect(tool.shouldRetryOnFailure).toBe(true);
		expect(tool.maxRetryAttempts).toBe(7);
	});

	it("defaults retry flags when options omit them", () => {
		function ping() {
			return "pong";
		}

		const tool = new FunctionTool(ping, { description: "ping" });
		expect(tool.shouldRetryOnFailure).toBe(false);
		expect(tool.maxRetryAttempts).toBe(3);
	});

	it("overrides empty function name with options.name", () => {
		const anonymous = (() => {
			return (value: string) => value;
		})();
		Object.defineProperty(anonymous, "name", { value: "" });

		const tool = new FunctionTool(anonymous, {
			name: "named_tool",
			description: "Named override",
		});
		expect(tool.name).toBe("named_tool");
	});

	it("allows optional params with defaults while requiring others", async () => {
		function greet(name: string, label = "friend") {
			return { name, label };
		}

		const tool = new FunctionTool(greet, { description: "Optional label" });
		await expect(
			tool.runAsync({ name: "Ada" } as any, makeContext()),
		).resolves.toEqual({ name: "Ada", label: "friend" });
	});

	it("lists every missing mandatory parameter in the error", async () => {
		function pair(left: string, right: string) {
			return { left, right };
		}

		const tool = new FunctionTool(pair, { description: "Needs both" });
		const result = await tool.runAsync({} as any, makeContext());
		expect(result.error).toContain("left");
		expect(result.error).toContain("right");
	});

	it("normalizes sync falsy returns of 0, false, and null to {}", async () => {
		function zero() {
			return 0;
		}
		function flag() {
			return false;
		}
		function nada() {
			return null;
		}

		await expect(
			new FunctionTool(zero, { description: "zero" }).runAsync(
				{},
				makeContext(),
			),
		).resolves.toEqual({});
		await expect(
			new FunctionTool(flag, { description: "flag" }).runAsync(
				{},
				makeContext(),
			),
		).resolves.toEqual({});
		await expect(
			new FunctionTool(nada, { description: "nada" }).runAsync(
				{},
				makeContext(),
			),
		).resolves.toEqual({});
	});

	it("normalizes async falsy returns of 0, false, and null to {}", async () => {
		async function zero() {
			return 0;
		}
		async function flag() {
			return false;
		}
		async function nada() {
			return null;
		}

		await expect(
			new FunctionTool(zero, { description: "zero" }).runAsync(
				{},
				makeContext(),
			),
		).resolves.toEqual({});
		await expect(
			new FunctionTool(flag, { description: "flag" }).runAsync(
				{},
				makeContext(),
			),
		).resolves.toEqual({});
		await expect(
			new FunctionTool(nada, { description: "nada" }).runAsync(
				{},
				makeContext(),
			),
		).resolves.toEqual({});
	});

	it("stringifies non-Error throws in the error payload", async () => {
		function boom() {
			throw "boom";
		}

		const tool = new FunctionTool(boom, { description: "string throw" });
		const result = await tool.runAsync({}, makeContext());
		expect(result.error).toBe("Error executing function boom: boom");
	});

	it("keeps already-typed number and boolean values without re-coercion", async () => {
		function inspect(n: number, flag: boolean) {
			return { n, flag, nType: typeof n, flagType: typeof flag };
		}

		const tool = new FunctionTool(inspect, {
			description: "typed passthrough",
			parameterTypes: {
				n: "number" as any,
				flag: "boolean" as any,
			},
		});

		await expect(
			tool.runAsync({ n: 5, flag: false } as any, makeContext()),
		).resolves.toEqual({
			n: 5,
			flag: false,
			nType: "number",
			flagType: "boolean",
		});
	});

	it("leaves non-coercible number/boolean inputs unchanged", async () => {
		function inspect(n: number, flag: boolean) {
			return { n, flag };
		}

		const tool = new FunctionTool(inspect, {
			description: "invalid coerce",
			parameterTypes: {
				n: "number" as any,
				flag: "boolean" as any,
			},
		});

		await expect(
			tool.runAsync({ n: "abc", flag: 1 } as any, makeContext()),
		).resolves.toEqual({ n: "abc", flag: 1 });
	});

	it("stringifies objects for string parameters", async () => {
		function label(name: string) {
			return { name };
		}

		const tool = new FunctionTool(label, {
			description: "object stringify",
			parameterTypes: { name: "string" as any },
		});

		await expect(
			tool.runAsync({ name: { a: 1 } } as any, makeContext()),
		).resolves.toEqual({ name: "[object Object]" });
	});

	it("returns complex/unknown typed values unchanged via the default branch", async () => {
		function wrap(payload: unknown) {
			return { payload };
		}
		Object.defineProperty(wrap, "toString", {
			value: () => "function wrap(payload: CustomBag) { return { payload }; }",
		});

		const tool = new FunctionTool(wrap, {
			description: "complex payload",
			parameterTypes: { payload: "object" as any },
		});

		const payload = { nested: [1, 2] };
		await expect(
			tool.runAsync({ payload } as any, makeContext()),
		).resolves.toEqual({ payload });
	});

	it("coerces via declaration schema when parameterTypes omit a typed param", async () => {
		function inspect(count: number) {
			return { count, type: typeof count };
		}
		Object.defineProperty(inspect, "toString", {
			value: () =>
				"function inspect(count: number) { return { count, type: typeof count }; }",
		});

		const tool = new FunctionTool(inspect, {
			description: "schema fallback coerce",
		});

		await expect(
			tool.runAsync({ count: "3" } as any, makeContext()),
		).resolves.toEqual({ count: 3, type: "number" });
	});

	it("overrides declaration types only for keys present in parameterTypes", () => {
		function configure(a: number, b: string) {
			return { a, b };
		}
		Object.defineProperty(configure, "toString", {
			value: () =>
				"function configure(a: number, b: string) { return { a, b }; }",
		});

		const tool = new FunctionTool(configure, {
			description: "partial override",
			parameterTypes: {
				a: "number" as any,
				missing: "boolean" as any,
			},
		});

		const declaration = tool.getDeclaration();
		expect(declaration.parameters?.properties?.a?.type).toBe("number");
		expect(declaration.parameters?.properties?.b?.type).toBe("string");
		expect(declaration.parameters?.properties?.missing).toBeUndefined();
	});

	it("injects toolContext as a positional arg when the param name is toolContext", async () => {
		function withToolContext(value: string, toolContext: ToolContext) {
			return {
				value,
				hasActions: Boolean(toolContext?.actions),
			};
		}

		const tool = new FunctionTool(withToolContext, {
			description: "toolContext injection",
		});
		const context = makeContext();
		await expect(
			tool.runAsync({ value: "x" } as any, context),
		).resolves.toEqual({
			value: "x",
			hasActions: true,
		});
		expect(
			tool.getDeclaration().parameters?.properties?.toolContext,
		).toBeUndefined();
	});

	it("pushes undefined for optional params omitted from args after mandatory checks", async () => {
		function greet(name: string, title?: string) {
			return { name, title, titleType: typeof title };
		}
		Object.defineProperty(greet, "toString", {
			value: () =>
				"function greet(name, title = undefined) { return { name, title, titleType: typeof title }; }",
		});

		const tool = new FunctionTool(greet, { description: "optional title" });
		await expect(
			tool.runAsync({ name: "Ada" } as any, makeContext()),
		).resolves.toEqual({
			name: "Ada",
			title: undefined,
			titleType: "undefined",
		});
	});

	it("coerces boolean strings case-insensitively including True", async () => {
		function flag(enabled: boolean) {
			return { enabled };
		}

		const tool = new FunctionTool(flag, {
			description: "bool coerce",
			parameterTypes: { enabled: "boolean" as any },
		});

		await expect(
			tool.runAsync({ enabled: "True" } as any, makeContext()),
		).resolves.toEqual({ enabled: true });
		await expect(
			tool.runAsync({ enabled: "false" } as any, makeContext()),
		).resolves.toEqual({ enabled: false });
	});

	it("does not coerce non-numeric strings to number and leaves them as-is", async () => {
		function count(n: number) {
			return { n };
		}

		const tool = new FunctionTool(count, {
			description: "number coerce",
			parameterTypes: { n: "number" as any },
		});

		await expect(
			tool.runAsync({ n: "12px" } as any, makeContext()),
		).resolves.toEqual({ n: "12px" });
	});

	it("stringifies booleans and null for string parameters", async () => {
		function label(name: string) {
			return { name };
		}

		const tool = new FunctionTool(label, {
			description: "stringify edges",
			parameterTypes: { name: "string" as any },
		});

		await expect(
			tool.runAsync({ name: true } as any, makeContext()),
		).resolves.toEqual({ name: "true" });
		await expect(
			tool.runAsync({ name: null } as any, makeContext()),
		).resolves.toEqual({ name: null });
	});

	it("uses declaration schema type lowercasing for coercion fallback", async () => {
		function inspect(flag: boolean) {
			return { flag, type: typeof flag };
		}
		Object.defineProperty(inspect, "toString", {
			value: () =>
				"function inspect(flag: boolean) { return { flag, type: typeof flag }; }",
		});

		const tool = new FunctionTool(inspect, {
			description: "schema boolean coerce",
		});

		await expect(
			tool.runAsync({ flag: "false" } as any, makeContext()),
		).resolves.toEqual({ flag: false, type: "boolean" });
	});

	it("defaults parameter type to string when declaration has no schema type", async () => {
		function wrap(value: unknown) {
			return { value, type: typeof value };
		}
		Object.defineProperty(wrap, "toString", {
			value: () =>
				"function wrap(value) { return { value, type: typeof value }; }",
		});

		const tool = new FunctionTool(wrap, {
			description: "default string coerce",
		});

		await expect(
			tool.runAsync({ value: 9 } as any, makeContext()),
		).resolves.toEqual({ value: "9", type: "string" });
	});

	it("reports only missing mandatory args when some are present", async () => {
		function triple(a: string, b: string, c: string) {
			return { a, b, c };
		}

		const tool = new FunctionTool(triple, { description: "needs three" });
		const result = await tool.runAsync({ a: "1" } as any, makeContext());
		expect(result.error).toContain("b");
		expect(result.error).toContain("c");
		expect(result.error).not.toMatch(/\ba\b/);
	});

	it("awaits async functions that accept toolContext", async () => {
		async function load(id: string, toolContext: ToolContext) {
			await Promise.resolve();
			return { id, hasActions: Boolean(toolContext.actions) };
		}

		const tool = new FunctionTool(load, {
			description: "async with context",
		});
		await expect(
			tool.runAsync({ id: "42" } as any, makeContext()),
		).resolves.toEqual({ id: "42", hasActions: true });
	});

	it("wraps async function throws into the error envelope", async () => {
		async function boom() {
			await Promise.resolve();
			throw new Error("async-boom");
		}

		const tool = new FunctionTool(boom, { description: "async boom" });
		await expect(tool.runAsync({}, makeContext())).resolves.toEqual({
			error: "Error executing function boom: async-boom",
		});
	});

	it("preserves truthy sync return values including empty arrays and objects", async () => {
		function emptyArr() {
			return [];
		}
		function emptyObj() {
			return {};
		}

		await expect(
			new FunctionTool(emptyArr, { description: "arr" }).runAsync(
				{},
				makeContext(),
			),
		).resolves.toEqual([]);
		await expect(
			new FunctionTool(emptyObj, { description: "obj" }).runAsync(
				{},
				makeContext(),
			),
		).resolves.toEqual({});
	});

	it("getDeclaration repeatedly rebuilds and reapplies parameterTypes", () => {
		function configure(a: number) {
			return a;
		}
		Object.defineProperty(configure, "toString", {
			value: () => "function configure(a: string) { return a; }",
		});

		const tool = new FunctionTool(configure, {
			description: "rebuild declaration",
			parameterTypes: { a: "number" as any },
		});

		const first = tool.getDeclaration();
		const second = tool.getDeclaration();
		expect(first.parameters?.properties?.a?.type).toBe("number");
		expect(second.parameters?.properties?.a?.type).toBe("number");
		expect(first).not.toBe(second);
	});

	it("does not treat empty string args as missing mandatory parameters", async () => {
		function greet(name: string) {
			return { name, length: name.length };
		}

		const tool = new FunctionTool(greet, { description: "empty ok" });
		await expect(
			tool.runAsync({ name: "" } as any, makeContext()),
		).resolves.toEqual({ name: "", length: 0 });
	});

	it("accepts maxRetryAttempts of 0 via options || fallback to 3", () => {
		function ping() {
			return "pong";
		}
		const tool = new FunctionTool(ping, {
			description: "zero max",
			maxRetryAttempts: 0,
		});
		expect(tool.maxRetryAttempts).toBe(3);
	});

	it("treats toString without parentheses as empty parameter list", () => {
		function weird() {
			return "ok";
		}
		Object.defineProperty(weird, "toString", {
			value: () => "function weird /* no paren */ { return 'ok'; }",
		});

		const tool = new FunctionTool(weird, {
			description: "no paren toString",
		});
		expect(tool.getDeclaration().parameters?.properties).toEqual({});
	});

	it("arrow function without parentheses yields empty params from toString parse", () => {
		const arrow = (x: string) => ({ x });
		Object.defineProperty(arrow, "toString", {
			value: () => "x => ({ x })",
		});
		Object.defineProperty(arrow, "name", { value: "arrow_no_paren" });

		const tool = new FunctionTool(arrow, {
			description: "arrow without parens",
			name: "arrow_no_paren",
		});
		expect(tool.getDeclaration().parameters?.properties).toEqual({});
		expect(tool.name).toBe("arrow_no_paren");
	});
});
