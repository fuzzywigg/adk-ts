import { describe, expect, it, vi } from "vitest";
import { getLongRunningFunctionCalls } from "../../../flows/llm-flows/functions";
import { BaseTool } from "../../../tools/base/base-tool";
import type { ToolContext } from "../../../tools/tool-context";

vi.mock("../../../logger", () => ({
	Logger: vi.fn(() => ({
		debug: vi.fn(),
		error: vi.fn(),
		warn: vi.fn(),
		info: vi.fn(),
	})),
}));

class SlowTool extends BaseTool {
	constructor(name: string) {
		super({ name, description: "slow", isLongRunning: true });
	}

	async runAsync(_args: Record<string, any>, _context: ToolContext) {
		return { ok: true };
	}
}

describe("getLongRunningFunctionCalls empty id + name in case twelfth leftover", () => {
	const slow = new SlowTool("slow");

	it("empty-string id is falsy so the call is omitted", () => {
		const ids = getLongRunningFunctionCalls(
			[
				{ name: "slow", id: "" },
				{ name: "slow", id: "keep" },
			],
			{ slow },
		);
		expect([...ids]).toEqual(["keep"]);
	});

	it("whitespace id is truthy and kept", () => {
		const ids = getLongRunningFunctionCalls([{ name: "slow", id: " " }], {
			slow,
		});
		expect([...ids]).toEqual([" "]);
	});

	it("name case miss fails `in` so Slow is not treated as slow", () => {
		const ids = getLongRunningFunctionCalls([{ name: "Slow", id: "c1" }], {
			slow,
		});
		expect([...ids]).toEqual([]);
	});

	it("exact dict key is collected", () => {
		const ids = getLongRunningFunctionCalls([{ name: "slow", id: "c1" }], {
			slow,
		});
		expect([...ids]).toEqual(["c1"]);
	});
});
