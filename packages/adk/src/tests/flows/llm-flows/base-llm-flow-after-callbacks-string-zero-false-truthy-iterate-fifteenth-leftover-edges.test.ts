import type { InvocationContext } from "@adk/agents";
import { Event } from "@adk/events";
import { SingleFlow } from "@adk/flows";
import type { LlmResponse } from "@adk/models";
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
 * 03ff90a8; supersedes closed #273/#262): before-callbacks string iterate
 * companion — `if (!afterCallbacks)` treats `"0"` / `"false"` as truthy so
 * `for (const callback of afterCallbacks)` iterates characters and throws
 * when a letter is invoked as a function.
 */
describe("base-llm-flow after-callbacks string-zero/false truthy iterate fifteenth leftover", () => {
	it.each([
		{ label: '"0"', value: "0" },
		{ label: '"false"', value: "false" },
	])("canonicalAfterModelCallbacks=$label iterates chars and throws", async ({
		value,
	}) => {
		const flow = new InspectableFlow();
		await expect(
			flow._handleAfterModelCallback(
				makeCtx({
					agent: {
						name: "after-str-list",
						canonicalAfterModelCallbacks: value as any,
					},
				}),
				{
					content: { role: "model", parts: [{ text: "orig" }] },
				} as LlmResponse,
				new Event({ id: "me", author: "after-str-list" }),
			),
		).rejects.toThrow();
	});

	it("null still returns undefined via !afterCallbacks", async () => {
		const flow = new InspectableFlow();
		const result = await flow._handleAfterModelCallback(
			makeCtx({
				agent: {
					name: "after-null",
					canonicalAfterModelCallbacks: null,
				},
			}),
			{
				content: { role: "model", parts: [{ text: "orig" }] },
			} as LlmResponse,
			new Event({ id: "me", author: "after-null" }),
		);
		expect(result).toBeUndefined();
	});
});
