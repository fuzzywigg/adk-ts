import { describe, expect, it } from "vitest";
import { FunctionTool } from "../../../tools/function/function-tool";
import type { ToolContext } from "../../../tools/tool-context";

function makeContext(): ToolContext {
	return { actions: {} } as ToolContext;
}

/**
 * Fifteenth leftover: `func.constructor.name === "AsyncFunction"` — real
 * async uses `await result || {}` so null/undefined → `{}`. Sync functions
 * that return a Promise are not detected as async; `promise || {}` keeps the
 * Promise, then the outer async `runAsync` flattens it — falsy resolved
 * values are NOT coalesced to `{}`.
 */
describe("function-tool AsyncFunction name detect fifteenth leftover", () => {
	it("async falsy return coalesces via await || {}", async () => {
		async function emptyAsync() {
			return null as any;
		}
		const tool = new FunctionTool(emptyAsync, {
			description: "Async null coalesce",
		});
		await expect(tool.runAsync({} as any, makeContext())).resolves.toEqual({});
	});

	it("async undefined return coalesces via await || {}", async () => {
		async function undefAsync() {
			return undefined as any;
		}
		const tool = new FunctionTool(undefAsync, {
			description: "Async undefined coalesce",
		});
		await expect(tool.runAsync({} as any, makeContext())).resolves.toEqual({});
	});

	it("sync Promise.resolve(null) flattens to null (no || {} after await)", async () => {
		function syncPromiseNull() {
			return Promise.resolve(null);
		}
		expect(syncPromiseNull.constructor.name).toBe("Function");
		const tool = new FunctionTool(syncPromiseNull, {
			description: "Sync promise misdetect",
		});
		// Outer async runAsync flattens the returned Promise; null is not
		await expect(tool.runAsync({} as any, makeContext())).resolves.toBeNull();
	});

	it("sync Promise.resolve(undefined) flattens to undefined (asymmetry)", async () => {
		function syncPromiseUndef() {
			return Promise.resolve(undefined);
		}
		const tool = new FunctionTool(syncPromiseUndef, {
			description: "Sync promise undefined",
		});
		await expect(
			tool.runAsync({} as any, makeContext()),
		).resolves.toBeUndefined();
	});

	it("real async still returns awaited payload (control)", async () => {
		async function ok() {
			return { ok: true };
		}
		const tool = new FunctionTool(ok, { description: "Async control" });
		await expect(tool.runAsync({} as any, makeContext())).resolves.toEqual({
			ok: true,
		});
	});
});
