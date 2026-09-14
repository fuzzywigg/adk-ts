import { describe, expect, it } from "vitest";
import { FunctionTool } from "../../../tools/function/function-tool";
import type { ToolContext } from "../../../tools/tool-context";

function withSource(
	impl: (...args: any[]) => any,
	source: string,
	name = "fn",
): (...args: any[]) => any {
	Object.defineProperty(impl, "toString", { value: () => source });
	Object.defineProperty(impl, "name", { value: name });
	return impl;
}

function makeContext(): ToolContext {
	return { actions: { stateDelta: {} } } as ToolContext;
}

describe("FunctionTool deepen edges (TOKENMAXX remainder)", () => {
	it("convertArgumentType NUMBER via parameterTypes lowercasing", async () => {
		const func = withSource(
			(count: any) => ({ count, type: typeof count }),
			"function scale(count) { return { count, type: typeof count }; }",
			"scale",
		);
		const tool = new FunctionTool(func, {
			name: "scale",
			description: "Scales a count value",
			parameterTypes: { count: "NUMBER" },
		});
		await expect(
			tool.runAsync({ count: "1e2" } as any, makeContext()),
		).resolves.toEqual({ count: 100, type: "number" });
	});

	it("convertArgumentType BOOLEAN only treats lowercase true as true", async () => {
		const func = withSource(
			(flag: any) => ({ flag }),
			"function toggle(flag) { return { flag }; }",
			"toggle",
		);
		const tool = new FunctionTool(func, {
			name: "toggle",
			description: "Toggles a boolean flag",
			parameterTypes: { flag: "BOOLEAN" },
		});
		await expect(
			tool.runAsync({ flag: "TRUE" } as any, makeContext()),
		).resolves.toEqual({ flag: true });
		await expect(
			tool.runAsync({ flag: "False" } as any, makeContext()),
		).resolves.toEqual({ flag: false });
		await expect(
			tool.runAsync({ flag: "yes" } as any, makeContext()),
		).resolves.toEqual({ flag: false });
	});

	it("whitespace-only number string is not converted", async () => {
		const func = withSource(
			(n: any) => ({ n, type: typeof n }),
			"function parse_n(n) { return { n, type: typeof n }; }",
			"parse_n",
		);
		const tool = new FunctionTool(func, {
			name: "parse_n",
			description: "Parses a numeric string",
			parameterTypes: { n: "number" },
		});
		await expect(
			tool.runAsync({ n: "  " } as any, makeContext()),
		).resolves.toEqual({ n: "  ", type: "string" });
	});

	it("functionAcceptsToolContext true for body substring context without param", async () => {
		const func = withSource(
			(query: string) => ({ query, mentioned: "context" }),
			'function lookup(query) { return { query, mentioned: "context" }; }',
			"lookup",
		);
		const tool = new FunctionTool(func, {
			name: "lookup",
			description: "Looks up with context substring",
		});
		const ctx = makeContext();
		const result = await tool.runAsync({ query: "x" } as any, ctx);
		expect(result).toEqual({ query: "x", mentioned: "context" });
	});

	it("injects toolContext when parameter is named toolContext", async () => {
		const func = withSource(
			(query: string, toolContext: ToolContext) => ({
				query,
				hasActions: Boolean(toolContext?.actions),
			}),
			"function lookup(query, toolContext) { return { query, hasActions: Boolean(toolContext?.actions) }; }",
			"lookup",
		);
		const tool = new FunctionTool(func, {
			name: "lookup",
			description: "Looks up with toolContext param",
		});
		await expect(
			tool.runAsync({ query: "q" } as any, makeContext()),
		).resolves.toEqual({ query: "q", hasActions: true });
	});

	it("async function path awaits result while sync returning Promise is not awaited as AsyncFunction", async () => {
		async function asyncAdd(a: number, b: number) {
			return { sum: a + b };
		}
		const asyncTool = new FunctionTool(asyncAdd, {
			name: "async_add",
			description: "Adds asynchronously",
			parameterTypes: { a: "number", b: "number" },
		});
		await expect(
			asyncTool.runAsync({ a: 1, b: 2 } as any, makeContext()),
		).resolves.toEqual({ sum: 3 });

		const syncPromise = withSource(
			(a: number, b: number) => Promise.resolve({ sum: a + b }),
			"function sync_promise(a, b) { return Promise.resolve({ sum: a + b }); }",
			"sync_promise",
		);
		const syncTool = new FunctionTool(syncPromise, {
			name: "sync_promise",
			description: "Returns a promise synchronously",
			parameterTypes: { a: "number", b: "number" },
		});
		const syncResult = await syncTool.runAsync(
			{ a: 3, b: 4 } as any,
			makeContext(),
		);
		expect(syncResult).toBeInstanceOf(Promise);
		await expect(syncResult).resolves.toEqual({ sum: 7 });
	});

	it("returns missing mandatory args envelope", async () => {
		const func = withSource(
			(id: string, label: string) => ({ id, label }),
			"function tagged(id, label) { return { id, label }; }",
			"tagged",
		);
		const tool = new FunctionTool(func, {
			name: "tagged",
			description: "Requires id and label",
		});
		const result = await tool.runAsync({ id: "1" } as any, makeContext());
		expect(result.error).toContain("mandatory input parameters");
		expect(result.error).toContain("label");
	});

	it("catch path wraps thrown errors", async () => {
		const func = withSource(
			() => {
				throw new Error("inside");
			},
			"function boom() { throw new Error('inside'); }",
			"boom",
		);
		const tool = new FunctionTool(func, {
			name: "boom",
			description: "Always throws an error",
		});
		await expect(tool.runAsync({} as any, makeContext())).resolves.toEqual({
			error: "Error executing function boom: inside",
		});
	});
});
