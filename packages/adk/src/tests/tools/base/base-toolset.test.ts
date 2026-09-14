import { describe, expect, it } from "vitest";
import type { ReadonlyContext } from "../../../agents/readonly-context";
import type { BaseTool } from "../../../tools/base/base-tool";
import {
	BaseToolset,
	type ToolPredicate,
} from "../../../tools/base/base-toolset";

class MemoryToolset extends BaseToolset {
	constructor(private readonly tools: BaseTool[]) {
		super();
	}

	async getTools(readonlyContext?: ReadonlyContext): Promise<BaseTool[]> {
		if (!readonlyContext) {
			return [...this.tools];
		}
		return this.tools.filter((tool) => tool.name !== "hidden");
	}

	async close(): Promise<void> {
		this.tools.length = 0;
	}
}

describe("BaseToolset", () => {
	const search = { name: "search" } as BaseTool;
	const hidden = { name: "hidden" } as BaseTool;

	it("returns all tools when context is omitted", async () => {
		const toolset = new MemoryToolset([search, hidden]);
		await expect(toolset.getTools()).resolves.toEqual([search, hidden]);
	});

	it("can filter tools using readonly context", async () => {
		const toolset = new MemoryToolset([search, hidden]);
		await expect(toolset.getTools({} as ReadonlyContext)).resolves.toEqual([
			search,
		]);
	});

	it("closes and releases held tools", async () => {
		const toolset = new MemoryToolset([search]);
		await toolset.close();
		await expect(toolset.getTools()).resolves.toEqual([]);
	});

	it("supports ToolPredicate filtering helpers", () => {
		const allowSearch: ToolPredicate = (tool) => tool.name === "search";
		expect(allowSearch(search)).toBe(true);
		expect(allowSearch(hidden)).toBe(false);
	});

	it("supports ToolPredicate that consults readonly context", () => {
		const allowWhenAdmin: ToolPredicate = (tool, ctx) => {
			const role = (ctx as any)?.userContent?.role;
			return role === "admin" || tool.name === "search";
		};

		expect(
			allowWhenAdmin(hidden, { userContent: { role: "admin" } } as any),
		).toBe(true);
		expect(
			allowWhenAdmin(hidden, { userContent: { role: "viewer" } } as any),
		).toBe(false);
		expect(
			allowWhenAdmin(search, { userContent: { role: "viewer" } } as any),
		).toBe(true);
		expect(allowWhenAdmin(search)).toBe(true);
	});

	it("returns a shallow copy so callers cannot mutate internal tool list via getTools", async () => {
		const toolset = new MemoryToolset([search, hidden]);
		const tools = await toolset.getTools();
		tools.pop();
		await expect(toolset.getTools()).resolves.toEqual([search, hidden]);
	});

	it("close is idempotent and leaves subsequent getTools empty", async () => {
		const toolset = new MemoryToolset([search, hidden]);
		await toolset.close();
		await toolset.close();
		await expect(toolset.getTools()).resolves.toEqual([]);
		await expect(toolset.getTools({} as ReadonlyContext)).resolves.toEqual([]);
	});

	it("filters with context even when the toolset holds a single tool", async () => {
		const toolset = new MemoryToolset([hidden]);
		await expect(toolset.getTools({} as ReadonlyContext)).resolves.toEqual([]);
		await expect(toolset.getTools()).resolves.toEqual([hidden]);
	});

	it("composes multiple ToolPredicates with AND/OR semantics", () => {
		const isSearch: ToolPredicate = (tool) => tool.name === "search";
		const notHidden: ToolPredicate = (tool) => tool.name !== "hidden";
		const andPred: ToolPredicate = (tool, ctx) =>
			isSearch(tool, ctx) && notHidden(tool, ctx);
		const orPred: ToolPredicate = (tool, ctx) =>
			isSearch(tool, ctx) || tool.name === "hidden";

		expect(andPred(search)).toBe(true);
		expect(andPred(hidden)).toBe(false);
		expect(orPred(search)).toBe(true);
		expect(orPred(hidden)).toBe(true);
		expect(orPred({ name: "other" } as BaseTool)).toBe(false);
	});

	it("allows concrete toolsets to ignore context entirely", async () => {
		class AlwaysAllToolset extends BaseToolset {
			constructor(private readonly tools: BaseTool[]) {
				super();
			}
			async getTools(_readonlyContext?: ReadonlyContext): Promise<BaseTool[]> {
				return [...this.tools];
			}
			async close(): Promise<void> {}
		}

		const toolset = new AlwaysAllToolset([search, hidden]);
		await expect(toolset.getTools({} as ReadonlyContext)).resolves.toEqual([
			search,
			hidden,
		]);
	});

	it("allows concrete toolsets to throw from close for resource failures", async () => {
		class FailingCloseToolset extends BaseToolset {
			async getTools(): Promise<BaseTool[]> {
				return [];
			}
			async close(): Promise<void> {
				throw new Error("close failed");
			}
		}

		const toolset = new FailingCloseToolset();
		await expect(toolset.close()).rejects.toThrow("close failed");
	});

	it("ToolPredicate may use tool metadata beyond name", () => {
		const longRunningOnly: ToolPredicate = (tool) =>
			Boolean((tool as any).isLongRunning);
		expect(
			longRunningOnly({ name: "x", isLongRunning: true } as BaseTool),
		).toBe(true);
		expect(
			longRunningOnly({ name: "x", isLongRunning: false } as BaseTool),
		).toBe(false);
	});
});

describe("BaseToolset leftover ToolPredicate null context edges", () => {
	const search = { name: "search" } as BaseTool;
	const hidden = { name: "hidden" } as BaseTool;

	it("ToolPredicate treats null context differently from undefined via optional chaining", () => {
		const needsCtx: ToolPredicate = (_tool, ctx) => ctx != null;
		expect(needsCtx(search)).toBe(false);
		expect(needsCtx(search, undefined)).toBe(false);
		expect(needsCtx(search, null as any)).toBe(false);

		const seesNull: ToolPredicate = (_tool, ctx) => ctx === null;
		expect(seesNull(search)).toBe(false);
		expect(seesNull(search, undefined)).toBe(false);
		expect(seesNull(search, null as any)).toBe(true);
	});

	it("MemoryToolset getTools with null context follows the falsy branch", async () => {
		const toolset = new MemoryToolset([search, hidden]);
		await expect(toolset.getTools(null as any)).resolves.toEqual([
			search,
			hidden,
		]);
	});
});
