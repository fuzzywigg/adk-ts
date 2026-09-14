import Module from "node:module";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createFunctionTool } from "../../../tools/function";
import * as functionToolModule from "../../../tools/function/function-tool";
import { FunctionTool } from "../../../tools/function/function-tool";
import type { ToolContext } from "../../../tools/tool-context";

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

describe("createFunctionTool fifth leftover factory matrices", () => {
	it("returns FunctionTool instance identity", () => {
		function ping() {
			return "pong";
		}
		const tool = createFunctionTool(ping, {
			description: "Factory identity check",
		});
		expect(tool).toBeInstanceOf(FunctionTool);
	});

	it("empty name option falls through to func.name", () => {
		function echo(value: string) {
			return { value };
		}
		const tool = createFunctionTool(echo, {
			name: "",
			description: "Empty name falls through in factory",
		});
		expect(tool.name).toBe("echo");
	});

	it.each([
		[undefined, false],
		[null, false],
		[false, false],
		[0, false],
		[true, true],
	] as const)("factory isLongRunning %j → %s", (value, expected) => {
		function ping() {
			return "pong";
		}
		const tool = createFunctionTool(ping, {
			description: "Factory isLongRunning matrix",
			isLongRunning: value as any,
		});
		expect(tool.isLongRunning).toBe(expected);
	});

	it.each([
		[undefined, 3],
		[null, 3],
		[0, 3],
		[8, 8],
	] as const)("factory maxRetryAttempts %j → %s", (value, expected) => {
		function ping() {
			return "pong";
		}
		const tool = createFunctionTool(ping, {
			description: "Factory maxRetryAttempts matrix",
			maxRetryAttempts: value as any,
		});
		expect(tool.maxRetryAttempts).toBe(expected);
	});

	it("forwards parameterTypes via as-any options bag", async () => {
		function add(a: number, b: number) {
			return { sum: a + b };
		}
		const tool = createFunctionTool(add, {
			description: "Factory forwards parameterTypes",
			parameterTypes: { a: "number", b: "number" },
		} as any);
		await expect(
			tool.runAsync({ a: "2", b: "3" } as any, makeContext()),
		).resolves.toEqual({ sum: 5 });
		expect(tool.getDeclaration().parameters?.properties?.a?.type).toBe(
			"number",
		);
	});

	it("omitted options still constructs when description provided via JSDoc", () => {
		const fn = function documented() {
			return 1;
		};
		Object.defineProperty(fn, "toString", {
			value: () =>
				`/**
 * Documented factory function description
 */
function documented() { return 1; }`,
		});
		const tool = createFunctionTool(fn);
		expect(tool.name).toBe("documented");
		expect(tool.description).toContain(
			"Documented factory function description",
		);
	});

	it("runs async factory-created tools", async () => {
		async function doubleValue(n: number) {
			return { doubled: n * 2 };
		}
		const tool = createFunctionTool(doubleValue, {
			description: "Async factory tool",
			parameterTypes: { n: "number" },
		} as any);
		await expect(
			tool.runAsync({ n: "6" } as any, makeContext()),
		).resolves.toEqual({ doubled: 12 });
	});

	it("factory missing-args envelope matches FunctionTool", async () => {
		function greet(name: string) {
			return `hi ${name}`;
		}
		const tool = createFunctionTool(greet, {
			description: "Factory missing args envelope",
		});
		const result = await tool.runAsync({} as any, makeContext());
		expect(result.error).toContain("mandatory input parameters");
		expect(result.error).toContain("name");
	});
});
