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

describe("createFunctionTool remainder edges (TOKENMAXX)", () => {
	it("forwards name description long-running and retry options", async () => {
		function ping() {
			return { ok: true };
		}
		const tool = createFunctionTool(ping, {
			name: "ping_tool",
			description: "Pings for health checks",
			isLongRunning: true,
			shouldRetryOnFailure: true,
			maxRetryAttempts: 4,
		});
		expect(tool).toBeInstanceOf(FunctionTool);
		expect(tool.name).toBe("ping_tool");
		expect(tool.description).toBe("Pings for health checks");
		expect(tool.isLongRunning).toBe(true);
		expect(tool.shouldRetryOnFailure).toBe(true);
		expect(tool.maxRetryAttempts).toBe(4);
		await expect(tool.runAsync({} as any, makeContext())).resolves.toEqual({
			ok: true,
		});
	});

	it("defaults to function name when options omitted", () => {
		function named_probe() {
			return 1;
		}
		const tool = createFunctionTool(named_probe, {
			description: "Named probe without options.name",
		});
		expect(tool.name).toBe("named_probe");
	});

	it("factory public options path stringifies without parameterTypes", async () => {
		function add(a: number, b: number) {
			return { sum: a + b };
		}
		const tool = createFunctionTool(add, {
			name: "add_nums",
			description: "Adds two numbers via factory",
		});
		const declaration = tool.getDeclaration();
		expect(declaration.name).toBe("add_nums");
		await expect(
			tool.runAsync({ a: "2", b: "3" } as any, makeContext()),
		).resolves.toEqual({ sum: "23" });
	});
});
