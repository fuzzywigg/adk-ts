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

/**
 * Fifteenth leftover (HEAVY tip-relaunch residual after tip 0e4d57c / #261,
 * supersedes closed #262): twelfth leftover pins empty id omit via
 * `functionCall.id && …`. String `"0"` / `"false"` are truthy so they are
 * added to the long-running set.
 */
describe("functions long-running id string-zero/false fifteenth leftover", () => {
	const slow = new SlowTool("slow");

	it.each([
		{ label: '"0"', id: "0" },
		{ label: '"false"', id: "false" },
	])("truthy id $label is added to long-running set", ({ id }) => {
		const ids = getLongRunningFunctionCalls([{ name: "slow", id }], {
			slow,
		});
		expect([...ids]).toEqual([id]);
	});

	it("empty-string id still skipped (twelfth control)", () => {
		const ids = getLongRunningFunctionCalls([{ name: "slow", id: "" }], {
			slow,
		});
		expect([...ids]).toEqual([]);
	});
});
