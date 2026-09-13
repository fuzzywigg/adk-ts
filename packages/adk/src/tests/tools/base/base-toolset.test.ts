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
});
