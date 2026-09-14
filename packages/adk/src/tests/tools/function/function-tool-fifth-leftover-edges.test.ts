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
	return { actions: {} } as ToolContext;
}

describe("FunctionTool fifth leftover edges (TOKENMAXX)", () => {
	it("null/undefined args pass through convertArgumentType unchanged", async () => {
		const func = withSource(
			(value: any) => ({ value, isNull: value === null }),
			"function mirror(value) { return { value, isNull: value === null }; }",
			"mirror",
		);
		const tool = new FunctionTool(func, {
			name: "mirror",
			description: "Mirrors nullish values",
			parameterTypes: { value: "number" },
		});
		await expect(
			tool.runAsync({ value: null } as any, makeContext()),
		).resolves.toEqual({ value: null, isNull: true });
		await expect(
			tool.runAsync({ value: undefined } as any, makeContext()),
		).resolves.toEqual({ value: undefined, isNull: false });
	});

	it("string parameterTypes force String() conversion", async () => {
		const func = withSource(
			(label: any) => ({ label, type: typeof label }),
			"function labelize(label) { return { label, type: typeof label }; }",
			"labelize",
		);
		const tool = new FunctionTool(func, {
			name: "labelize",
			description: "Stringifies labels",
			parameterTypes: { label: "string" },
		});
		await expect(
			tool.runAsync({ label: 42 } as any, makeContext()),
		).resolves.toEqual({ label: "42", type: "string" });
	});

	it("getDeclaration overrides property types from parameterTypes", () => {
		const func = withSource(
			(count: any) => count,
			"function count_items(count) { return count; }",
			"count_items",
		);
		const tool = new FunctionTool(func, {
			name: "count_items",
			description: "Counts items with explicit type",
			parameterTypes: { count: "NUMBER" },
		});
		const declaration = tool.getDeclaration();
		expect(declaration.parameters?.properties?.count?.type).toBe("NUMBER");
	});

	it("|| {} coerces falsy function returns for async and sync", async () => {
		async function asyncZero() {
			return 0 as any;
		}
		const asyncTool = new FunctionTool(asyncZero, {
			name: "async_zero",
			description: "Async falsy coalesce",
		});
		await expect(asyncTool.runAsync({} as any, makeContext())).resolves.toEqual(
			{},
		);

		const syncFalse = withSource(
			() => false,
			"function sync_false() { return false; }",
			"sync_false",
		);
		const syncTool = new FunctionTool(syncFalse, {
			name: "sync_false",
			description: "Sync falsy coalesce",
		});
		await expect(syncTool.runAsync({} as any, makeContext())).resolves.toEqual(
			{},
		);
	});

	it("uses function name and JSDoc description when options omitted", () => {
		/**
		 * Greets a user warmly
		 */
		function greet_user() {
			return { hi: true };
		}
		const tool = new FunctionTool(greet_user);
		expect(tool.name).toBe("greet_user");
		expect(tool.description).toContain("Greets a user warmly");
	});

	it("missing args check uses in-operator so undefined values count as present", async () => {
		const func = withSource(
			(id: any) => ({ id }),
			"function by_id(id) { return { id }; }",
			"by_id",
		);
		const tool = new FunctionTool(func, {
			name: "by_id",
			description: "Looks up by id",
		});
		await expect(
			tool.runAsync({ id: undefined } as any, makeContext()),
		).resolves.toEqual({ id: undefined });
	});
});
