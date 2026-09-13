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
});
