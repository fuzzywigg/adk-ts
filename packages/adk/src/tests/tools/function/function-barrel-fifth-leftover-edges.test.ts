import Module from "node:module";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as functionBarrel from "../../../tools/function";
import {
	buildFunctionDeclaration,
	createFunctionTool,
	FunctionTool,
} from "../../../tools/function";
import * as functionToolModule from "../../../tools/function/function-tool";
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

describe("function barrel fifth leftover re-export edges", () => {
	it("re-exports FunctionTool, buildFunctionDeclaration, createFunctionTool", () => {
		expect(functionBarrel.FunctionTool).toBe(FunctionTool);
		expect(functionBarrel.buildFunctionDeclaration).toBe(
			buildFunctionDeclaration,
		);
		expect(functionBarrel.createFunctionTool).toBe(createFunctionTool);
	});

	it("createFunctionTool from barrel matches direct FunctionTool behavior", async () => {
		function add(a: number, b: number) {
			return { sum: a + b };
		}
		const viaFactory = createFunctionTool(add, {
			description: "Barrel factory parity",
			parameterTypes: { a: "number", b: "number" },
		} as any);
		const viaClass = new FunctionTool(add, {
			description: "Barrel factory parity",
			parameterTypes: { a: "number" as any, b: "number" as any },
		});
		expect(viaFactory).toBeInstanceOf(FunctionTool);
		await expect(
			viaFactory.runAsync({ a: "1", b: "2" } as any, makeContext()),
		).resolves.toEqual({ sum: 3 });
		await expect(
			viaClass.runAsync({ a: "1", b: "2" } as any, makeContext()),
		).resolves.toEqual({ sum: 3 });
	});

	it("buildFunctionDeclaration from barrel builds required params", () => {
		function greet(name: string) {
			return name;
		}
		const declaration = buildFunctionDeclaration(greet, {
			description: "Barrel buildFunctionDeclaration",
		});
		expect(declaration.name).toBe("greet");
		expect(declaration.description).toBe("Barrel buildFunctionDeclaration");
		expect(declaration.parameters?.required).toEqual(["name"]);
	});

	it("barrel createFunctionTool supports retry metadata", () => {
		function ping() {
			return "pong";
		}
		const tool = createFunctionTool(ping, {
			description: "Barrel retry metadata",
			shouldRetryOnFailure: true,
			maxRetryAttempts: 4,
			isLongRunning: true,
		});
		expect(tool.shouldRetryOnFailure).toBe(true);
		expect(tool.maxRetryAttempts).toBe(4);
		expect(tool.isLongRunning).toBe(true);
	});
});
