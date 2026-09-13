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

	it("coerces boolean false strings and leaves null args intact", async () => {
		function inspect(flag: boolean, maybe: string | null) {
			return { flag, maybe };
		}

		const tool = new FunctionTool(inspect, {
			description: "Coercion edges",
			parameterTypes: {
				flag: "boolean" as any,
				maybe: "string" as any,
			},
		});

		await expect(
			tool.runAsync({ flag: "false", maybe: null } as any, makeContext()),
		).resolves.toEqual({ flag: false, maybe: null });
	});

	it("skips optional params with defaults when description is provided", async () => {
		function greet(name: string, suffix = "!") {
			return { text: `${name}${suffix}` };
		}

		const tool = new FunctionTool(greet, {
			description: "Greets a user with an optional suffix.",
		});

		const missing = await tool.runAsync({} as any, makeContext());
		expect(missing.error).toContain("name");
		expect(missing.error).not.toContain("suffix");

		await expect(
			tool.runAsync({ name: "Ada" } as any, makeContext()),
		).resolves.toEqual({ text: "Ada!" });
	});

	it("wraps non-Error throws and preserves sync falsy zero via || {}", async () => {
		function boom() {
			throw "sync fail";
		}
		const boomTool = new FunctionTool(boom, { description: "boom" });
		expect(await boomTool.runAsync({}, makeContext())).toEqual({
			error: "Error executing function boom: sync fail",
		});

		function zero() {
			return 0;
		}
		const zeroTool = new FunctionTool(zero, { description: "zero" });
		await expect(zeroTool.runAsync({}, makeContext())).resolves.toEqual({});
	});
});
