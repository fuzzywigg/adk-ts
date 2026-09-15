import type { InvocationContext } from "@adk/agents";
import { Event } from "@adk/events";
import { SingleFlow } from "@adk/flows";
import { LlmRequest } from "@adk/models";
import { describe, expect, it, vi } from "vitest";

vi.mock("@adk/helpers/logger", () => ({
	Logger: vi.fn(() => ({
		debug: vi.fn(),
		error: vi.fn(),
		warn: vi.fn(),
		info: vi.fn(),
		debugArray: vi.fn(),
		debugStructured: vi.fn(),
	})),
}));

vi.mock("@adk/logger", () => ({
	Logger: vi.fn(() => ({
		debug: vi.fn(),
		error: vi.fn(),
		warn: vi.fn(),
		info: vi.fn(),
		debugArray: vi.fn(),
		debugStructured: vi.fn(),
	})),
}));

class InspectableFlow extends SingleFlow {}

function makeCtx(overrides: Record<string, unknown> = {}): InvocationContext {
	return {
		invocationId: "inv",
		branch: "main",
		session: { state: {}, events: [] },
		runConfig: {},
		incrementLlmCallCount: vi.fn(),
		...overrides,
	} as unknown as InvocationContext;
}

/**
 * Fifteenth leftover deepen (HEAVY tip-relaunch residual after tip #269 /
 * 03ff90a8; supersedes closed #273/#262): plugins residual pins string `"0"` /
 * `"false"` truthy iterate via `plugins || []`. Symmetric before-model list
 * gate — `if (!beforeCallbacks)` treats `"0"` / `"false"` as truthy so
 * `for (const callback of beforeCallbacks)` iterates characters and throws
 * when a letter is invoked as a function.
 */
describe("base-llm-flow before-callbacks string-zero/false truthy iterate fifteenth leftover", () => {
	it.each([
		{ label: '"0"', value: "0" },
		{ label: '"false"', value: "false" },
	])("canonicalBeforeModelCallbacks=$label iterates chars and throws", async ({
		value,
	}) => {
		const flow = new InspectableFlow();
		await expect(
			flow._handleBeforeModelCallback(
				makeCtx({
					agent: {
						name: "before-str-list",
						canonicalBeforeModelCallbacks: value as any,
					},
				}),
				new LlmRequest(),
				new Event({ id: "me", author: "before-str-list" }),
			),
		).rejects.toThrow();
	});

	it("empty array still returns undefined (falsy-list control)", async () => {
		const flow = new InspectableFlow();
		const result = await flow._handleBeforeModelCallback(
			makeCtx({
				agent: {
					name: "before-empty",
					canonicalBeforeModelCallbacks: [],
				},
			}),
			new LlmRequest(),
			new Event({ id: "me", author: "before-empty" }),
		);
		expect(result).toBeUndefined();
	});

	it("null still returns undefined via !beforeCallbacks", async () => {
		const flow = new InspectableFlow();
		const result = await flow._handleBeforeModelCallback(
			makeCtx({
				agent: {
					name: "before-null",
					canonicalBeforeModelCallbacks: null,
				},
			}),
			new LlmRequest(),
			new Event({ id: "me", author: "before-null" }),
		);
		expect(result).toBeUndefined();
	});
});
