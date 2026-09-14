import { describe, expect, it } from "vitest";
import type { ReadonlyContext } from "../../../agents/readonly-context";
import type { BaseTool } from "../../../tools/base/base-tool";
import {
	BaseToolset,
	type ToolPredicate,
} from "../../../tools/base/base-toolset";

class PredicateToolset extends BaseToolset {
	closed = 0;
	closeError: Error | null = null;

	constructor(
		private readonly tools: BaseTool[],
		private readonly predicate?: ToolPredicate,
	) {
		super();
	}

	async getTools(readonlyContext?: ReadonlyContext): Promise<BaseTool[]> {
		const list = [...this.tools];
		if (!this.predicate) {
			return list;
		}
		return list.filter((tool) => this.predicate!(tool, readonlyContext));
	}

	async close(): Promise<void> {
		this.closed += 1;
		if (this.closeError) {
			throw this.closeError;
		}
		this.tools.length = 0;
	}
}

describe("BaseToolset remainder edges (TOKENMAXX)", () => {
	const alpha = { name: "alpha" } as BaseTool;
	const beta = { name: "beta" } as BaseTool;
	const gamma = { name: "gamma" } as BaseTool;

	it("AND-composed predicates short-circuit on first false", async () => {
		const calls: string[] = [];
		const first: ToolPredicate = (tool) => {
			calls.push(`first:${tool.name}`);
			return tool.name !== "beta";
		};
		const second: ToolPredicate = (tool) => {
			calls.push(`second:${tool.name}`);
			return true;
		};
		const and: ToolPredicate = (tool, ctx) =>
			first(tool, ctx) && second(tool, ctx);
		const toolset = new PredicateToolset([alpha, beta, gamma], and);
		await expect(toolset.getTools()).resolves.toEqual([alpha, gamma]);
		expect(calls).toEqual([
			"first:alpha",
			"second:alpha",
			"first:beta",
			"first:gamma",
			"second:gamma",
		]);
	});

	it("OR-composed predicates short-circuit on first true", async () => {
		const calls: string[] = [];
		const first: ToolPredicate = (tool) => {
			calls.push(`first:${tool.name}`);
			return tool.name === "alpha";
		};
		const second: ToolPredicate = (tool) => {
			calls.push(`second:${tool.name}`);
			return tool.name === "gamma";
		};
		const or: ToolPredicate = (tool, ctx) =>
			first(tool, ctx) || second(tool, ctx);
		const toolset = new PredicateToolset([alpha, beta, gamma], or);
		await expect(toolset.getTools()).resolves.toEqual([alpha, gamma]);
		expect(calls).toContain("first:alpha");
		expect(calls).not.toContain("second:alpha");
		expect(calls).toContain("second:beta");
	});

	it("predicate with omitted context still filters", async () => {
		const allowAlpha: ToolPredicate = (tool, ctx) =>
			tool.name === "alpha" || Boolean((ctx as any)?.allowAll);
		const toolset = new PredicateToolset([alpha, beta], allowAlpha);
		await expect(toolset.getTools()).resolves.toEqual([alpha]);
		await expect(toolset.getTools({ allowAll: true } as any)).resolves.toEqual([
			alpha,
			beta,
		]);
	});

	it("close failure propagates and can leave tools intact", async () => {
		const toolset = new PredicateToolset([alpha, beta]);
		toolset.closeError = new Error("close-failed");
		await expect(toolset.close()).rejects.toThrow("close-failed");
		expect(toolset.closed).toBe(1);
		await expect(toolset.getTools()).resolves.toEqual([alpha, beta]);
	});

	it("successful close empties tools and increments closed counter", async () => {
		const toolset = new PredicateToolset([alpha]);
		await toolset.close();
		await toolset.close();
		expect(toolset.closed).toBe(2);
		await expect(toolset.getTools()).resolves.toEqual([]);
	});
});
