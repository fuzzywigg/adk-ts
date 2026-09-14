import { describe, expect, it } from "vitest";
import type { ReadonlyContext } from "../../../agents/readonly-context";
import { BaseTool } from "../../../tools/base/base-tool";
import {
	BaseToolset,
	type ToolPredicate,
} from "../../../tools/base/base-toolset";
import type { ToolContext } from "../../../tools/tool-context";

class StubTool extends BaseTool {
	async runAsync() {
		return { ok: true };
	}
}

class PredicateToolset extends BaseToolset {
	constructor(
		private readonly tools: BaseTool[],
		private readonly predicate?: ToolPredicate,
	) {
		super();
	}

	async getTools(readonlyContext?: ReadonlyContext): Promise<BaseTool[]> {
		if (!this.predicate) {
			return this.tools;
		}
		return this.tools.filter((tool) => this.predicate!(tool, readonlyContext));
	}

	async close(): Promise<void> {}
}

class TrackingToolset extends BaseToolset {
	closed = 0;
	lastContext: ReadonlyContext | undefined = Symbol("unset") as any;

	constructor(private readonly tools: BaseTool[]) {
		super();
	}

	async getTools(readonlyContext?: ReadonlyContext): Promise<BaseTool[]> {
		this.lastContext = readonlyContext;
		return [...this.tools];
	}

	async close(): Promise<void> {
		this.closed += 1;
	}
}

function makeTool(name: string): StubTool {
	return new StubTool({
		name,
		description: `Stub tool named ${name}`,
	});
}

describe("BaseToolset fifth leftover predicate / context matrices", () => {
	it("returns all tools when predicate is omitted", async () => {
		const tools = [makeTool("a_tool"), makeTool("b_tool")];
		const set = new PredicateToolset(tools);
		await expect(set.getTools()).resolves.toEqual(tools);
		await expect(set.getTools(undefined)).resolves.toEqual(tools);
		await expect(set.getTools({} as ReadonlyContext)).resolves.toEqual(tools);
	});

	it("filters with predicate that ignores context", async () => {
		const tools = [
			makeTool("keep_me"),
			makeTool("drop_me"),
			makeTool("keep_2"),
		];
		const set = new PredicateToolset(tools, (tool) =>
			tool.name.startsWith("keep"),
		);
		await expect(set.getTools()).resolves.toEqual([tools[0], tools[2]]);
	});

	it("passes undefined vs object context into predicate", async () => {
		const seen: Array<ReadonlyContext | undefined> = [];
		const tool = makeTool("ctx_tool");
		const set = new PredicateToolset([tool], (_tool, ctx) => {
			seen.push(ctx);
			return true;
		});
		await set.getTools();
		await set.getTools(undefined);
		await set.getTools({ agentName: "agent" } as any);
		expect(seen).toEqual([undefined, undefined, { agentName: "agent" }]);
	});

	it("AND composition of predicates", async () => {
		const tools = [makeTool("alpha"), makeTool("beta"), makeTool("alphabet")];
		const startsWithA: ToolPredicate = (tool) => tool.name.startsWith("a");
		const hasL: ToolPredicate = (tool) => tool.name.includes("l");
		const and: ToolPredicate = (tool, ctx) =>
			startsWithA(tool, ctx) && hasL(tool, ctx);
		const set = new PredicateToolset(tools, and);
		await expect(set.getTools()).resolves.toEqual([tools[0], tools[2]]);
	});

	it("OR composition of predicates", async () => {
		const tools = [makeTool("one"), makeTool("two"), makeTool("three")];
		const isOne: ToolPredicate = (tool) => tool.name === "one";
		const isThree: ToolPredicate = (tool) => tool.name === "three";
		const or: ToolPredicate = (tool, ctx) =>
			isOne(tool, ctx) || isThree(tool, ctx);
		const set = new PredicateToolset(tools, or);
		await expect(set.getTools()).resolves.toEqual([tools[0], tools[2]]);
	});

	it("predicate can reject every tool including empty-name edge tool", async () => {
		const named = makeTool("named_ok");
		const set = new PredicateToolset([named], () => false);
		await expect(set.getTools({} as ToolContext as any)).resolves.toEqual([]);
	});

	it("tracks omitted vs provided readonlyContext distinctly", async () => {
		const set = new TrackingToolset([makeTool("track")]);
		await set.getTools();
		expect(set.lastContext).toBeUndefined();
		const ctx = { invocationId: "inv-1" } as any;
		await set.getTools(ctx);
		expect(set.lastContext).toBe(ctx);
	});

	it("close can be called multiple times independently", async () => {
		const set = new TrackingToolset([]);
		await set.close();
		await set.close();
		expect(set.closed).toBe(2);
	});

	it("empty tool list stays empty across context variants", async () => {
		const set = new PredicateToolset([], () => true);
		for (const ctx of [undefined, null, {}, { x: 1 }] as const) {
			await expect(set.getTools(ctx as any)).resolves.toEqual([]);
		}
	});
});
