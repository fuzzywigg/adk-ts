import { describe, expect, it } from "vitest";
import { FunctionTool } from "../../../tools/function/function-tool";
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

describe("FunctionTool fifth leftover option / description matrices", () => {
	it("empty options.name falls through to func.name via ||", () => {
		function named_fn(x: string) {
			return { x };
		}
		const tool = new FunctionTool(named_fn, {
			name: "",
			description: "Empty name override falls through",
		});
		expect(tool.name).toBe("named_fn");
	});

	it("undefined options.name uses func.name", () => {
		function hello() {
			return "hi";
		}
		const tool = new FunctionTool(hello, {
			description: "Undefined name uses function name",
		});
		expect(tool.name).toBe("hello");
	});

	it("whitespace-only description does not fall through to JSDoc", () => {
		const fn = withSource(
			() => "x",
			`/**
 * Real JSDoc description that is long enough
 */
function documented() { return "x"; }`,
		);
		Object.defineProperty(fn, "name", { value: "documented" });
		const tool = new FunctionTool(fn, {
			description: "   ",
		});
		// "   " is truthy so JSDoc is skipped; BaseTool then rejects short desc...
		// Actually length is 3, so it passes minimum. Confirm it kept whitespace.
		expect(tool.description).toBe("   ");
	});

	it("empty description falls through to JSDoc trim", () => {
		const fn = withSource(
			() => "x",
			`/**
 * Documented leftover description text
 */
function documented() { return "x"; }`,
		);
		Object.defineProperty(fn, "name", { value: "documented" });
		const tool = new FunctionTool(fn, { description: "" });
		expect(tool.description).toContain("Documented leftover description text");
	});

	it("empty JSDoc block falls through to empty then BaseTool rejects", () => {
		const fn = withSource(
			() => "x",
			`/** */
function empty_doc() { return "x"; }`,
		);
		Object.defineProperty(fn, "name", { value: "empty_doc" });
		expect(
			() =>
				new FunctionTool(fn, {
					description: "",
				}),
		).toThrow(/too short/);
	});

	it("missing options uses empty description and rejects short default", () => {
		function bare() {
			return 1;
		}
		expect(() => new FunctionTool(bare)).toThrow(/too short/);
	});

	it.each([
		[undefined, false],
		[null, false],
		[false, false],
		[0, false],
		["", false],
		[true, true],
	] as const)("isLongRunning %j → %s", (value, expected) => {
		function ping() {
			return "pong";
		}
		const tool = new FunctionTool(ping, {
			description: "isLongRunning coalesce matrix",
			isLongRunning: value as any,
		});
		expect(tool.isLongRunning).toBe(expected);
	});

	it.each([
		[undefined, 3],
		[null, 3],
		[0, 3],
		["", 3],
		[5, 5],
	] as const)("maxRetryAttempts %j → %s", (value, expected) => {
		function ping() {
			return "pong";
		}
		const tool = new FunctionTool(ping, {
			description: "maxRetryAttempts coalesce matrix",
			maxRetryAttempts: value as any,
		});
		expect(tool.maxRetryAttempts).toBe(expected);
	});

	it("parameterTypes empty object skips override loop", () => {
		function add(a: number, b: number) {
			return a + b;
		}
		const tool = new FunctionTool(add, {
			description: "Empty parameterTypes does not override",
			parameterTypes: {},
		});
		const decl = tool.getDeclaration();
		expect(decl.parameters?.properties?.a).toBeDefined();
		expect(decl.parameters?.properties?.b).toBeDefined();
	});

	it("parameterTypes only overrides matching property names", () => {
		function add(a: number, b: number) {
			return a + b;
		}
		const tool = new FunctionTool(add, {
			description: "Partial parameterTypes override",
			parameterTypes: {
				a: "integer" as any,
				missing: "number" as any,
			},
		});
		const decl = tool.getDeclaration();
		expect(decl.parameters?.properties?.a?.type).toBe("integer");
		expect(decl.parameters?.properties?.b?.type).toBeDefined();
		expect(decl.parameters?.properties?.missing).toBeUndefined();
	});

	it("injects toolContext when param is literally named toolContext", async () => {
		function useCtx(value: string, toolContext: ToolContext) {
			return { value, hasActions: Boolean(toolContext?.actions) };
		}
		const tool = new FunctionTool(useCtx, {
			description: "Injects toolContext parameter",
		});
		await expect(tool.runAsync({ value: "x" }, makeContext())).resolves.toEqual(
			{ value: "x", hasActions: true },
		);
	});

	it("myContext substring triggers context detection via includes('context')", async () => {
		function useMyContext(value: string, myContext?: ToolContext) {
			return { value, injected: myContext !== undefined };
		}
		const tool = new FunctionTool(useMyContext, {
			description: "myContext contains context substring",
		});
		// functionAcceptsToolContext uses includes("context"), so myContext
		// counts; getMandatoryArgs filters only exact "context"/"toolContext".
		const missing = await tool.runAsync({ value: "x" } as any, makeContext());
		expect(missing.error).toContain("myContext");
		await expect(
			tool.runAsync(
				{ value: "x", myContext: makeContext() } as any,
				makeContext(),
			),
		).resolves.toEqual({ value: "x", injected: true });
	});

	it("returns {} for falsy sync results via || {}", async () => {
		const values = [0, false, "", null, undefined] as const;
		for (const [i, value] of values.entries()) {
			const fn = () => value as any;
			Object.defineProperty(fn, "name", { value: `falsy_${i}` });
			const tool = new FunctionTool(fn, {
				description: "Falsy sync result coalesce",
			});
			await expect(tool.runAsync({}, makeContext())).resolves.toEqual({});
		}
	});

	it("wraps non-Error throws from function body", async () => {
		function boom() {
			throw "raw-fail";
		}
		const tool = new FunctionTool(boom, {
			description: "Non-Error function throw wrap",
		});
		await expect(tool.runAsync({}, makeContext())).resolves.toEqual({
			error: "Error executing function boom: raw-fail",
		});
	});
});
