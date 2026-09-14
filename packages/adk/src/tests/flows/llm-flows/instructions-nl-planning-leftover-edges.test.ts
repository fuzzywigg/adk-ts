import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { InvocationContext } from "../../../agents/invocation-context";
import { requestProcessor as instructionsProcessor } from "../../../flows/llm-flows/instructions";
import {
	requestProcessor as nlPlanningRequestProcessor,
	responseProcessor as nlPlanningResponseProcessor,
} from "../../../flows/llm-flows/nl-planning";
import { LlmRequest } from "../../../models/llm-request";
import type { LlmResponse } from "../../../models/llm-response";
import { BuiltInPlanner } from "../../../planners/built-in-planner";
import { PlanReActPlanner } from "../../../planners/plan-re-act-planner";

vi.mock("../../../utils/instructions-utils", () => ({
	injectSessionState: vi.fn(
		async (instruction: string) => `injected:${instruction}`,
	),
}));

import { injectSessionState } from "../../../utils/instructions-utils";

async function drain(
	gen: AsyncGenerator<unknown, void, unknown>,
): Promise<unknown[]> {
	const items: unknown[] = [];
	for await (const item of gen) {
		items.push(item);
	}
	return items;
}

function makeNlContext(
	overrides: Record<string, unknown> = {},
): InvocationContext {
	return {
		invocationId: "inv-nl",
		branch: "main",
		agent: { name: "planner-agent" },
		session: {
			id: "s1",
			appName: "app",
			userId: "u1",
			state: {},
			events: [],
			lastUpdateTime: 0,
		},
		...overrides,
	} as unknown as InvocationContext;
}

describe("instructions leftover: isLlmAgent / rootAgent coalesce gates", () => {
	const nonLlmAgents = [
		{ label: "null agent", agent: null },
		{ label: "undefined agent", agent: undefined },
		{ label: "plain object without canonicalModel", agent: { name: "x" } },
		{ label: "string agent", agent: "not-an-agent" },
		{ label: "number agent", agent: 0 },
	] as const;

	for (const { label, agent } of nonLlmAgents) {
		it(`skips entirely for ${label}`, async () => {
			const llmRequest = new LlmRequest();
			await drain(
				instructionsProcessor.runAsync(
					{ agent } as unknown as InvocationContext,
					llmRequest,
				),
			);
			expect(llmRequest.getSystemInstructionText()).toBeUndefined();
			expect(injectSessionState).not.toHaveBeenCalled();
		});
	}

	it("skips global instruction when rootAgent lacks canonicalModel", async () => {
		vi.mocked(injectSessionState).mockClear();
		const agent = {
			name: "child",
			canonicalModel: "gpt-4o",
			instruction: "local",
			rootAgent: {
				name: "root",
				globalInstruction: "should-not-apply",
				canonicalGlobalInstruction: async () =>
					["should-not-apply", false] as [string, boolean],
			},
			canonicalInstruction: async () => ["local", true] as [string, boolean],
		};
		const llmRequest = new LlmRequest();
		await drain(
			instructionsProcessor.runAsync(
				{ agent } as unknown as InvocationContext,
				llmRequest,
			),
		);
		const text = llmRequest.getSystemInstructionText() ?? "";
		expect(text).toContain("local");
		expect(text).not.toContain("should-not-apply");
		expect(injectSessionState).not.toHaveBeenCalled();
	});

	it("skips global when root is LlmAgent but globalInstruction is falsy", async () => {
		vi.mocked(injectSessionState).mockClear();
		for (const globalInstruction of ["", null, undefined, false] as const) {
			const rootAgent = {
				canonicalModel: "gpt-4o",
				globalInstruction,
				canonicalGlobalInstruction: async () =>
					["ghost", false] as [string, boolean],
			};
			const agent = {
				name: "child",
				canonicalModel: "gpt-4o",
				rootAgent,
			};
			const llmRequest = new LlmRequest();
			await drain(
				instructionsProcessor.runAsync(
					{ agent } as unknown as InvocationContext,
					llmRequest,
				),
			);
			expect(llmRequest.getSystemInstructionText()).toBeUndefined();
		}
	});
});

describe("instructions leftover: bypassStateInjection + schema strip/$schema", () => {
	it("injects agent instruction when bypass is false and skips when true", async () => {
		vi.mocked(injectSessionState).mockClear();
		const cases: Array<{ bypass: boolean; expectInjected: boolean }> = [
			{ bypass: false, expectInjected: true },
			{ bypass: true, expectInjected: false },
		];
		for (const { bypass, expectInjected } of cases) {
			vi.mocked(injectSessionState).mockClear();
			const agent = {
				name: "child",
				canonicalModel: "gpt-4o",
				instruction: "raw",
				rootAgent: { name: "root" },
				canonicalInstruction: async () =>
					["raw-body", bypass] as [string, boolean],
			};
			const llmRequest = new LlmRequest();
			await drain(
				instructionsProcessor.runAsync(
					{ agent } as unknown as InvocationContext,
					llmRequest,
				),
			);
			const text = llmRequest.getSystemInstructionText() ?? "";
			if (expectInjected) {
				expect(injectSessionState).toHaveBeenCalledTimes(1);
				expect(text).toContain("injected:raw-body");
			} else {
				expect(injectSessionState).not.toHaveBeenCalled();
				expect(text).toContain("raw-body");
				expect(text).not.toContain("injected:");
			}
		}
	});

	it("strips $schema from toJSONSchema output while keeping other keys", async () => {
		const schema = z.object({ answer: z.string(), n: z.number() });
		const agent = {
			name: "schema-agent",
			canonicalModel: "gpt-4o",
			rootAgent: { name: "root" },
			outputSchema: schema,
		};
		const llmRequest = new LlmRequest();
		await drain(
			instructionsProcessor.runAsync(
				{ agent } as unknown as InvocationContext,
				llmRequest,
			),
		);
		const text = llmRequest.getSystemInstructionText() ?? "";
		expect(text).toContain("application/json");
		expect(text).toContain('"answer"');
		expect(text).not.toMatch(/"\$schema"/);
		expect(text).toContain("IMPORTANT: After any tool calls");
	});

	it("swallows schema errors without appending any instruction text", async () => {
		const agent = {
			name: "bad-schema",
			canonicalModel: "gpt-4o",
			rootAgent: { name: "root" },
			outputSchema: {
				get [Symbol.toStringTag]() {
					throw new Error("boom");
				},
			},
		};
		const llmRequest = new LlmRequest();
		const toJSONSchema = vi.spyOn(z, "toJSONSchema").mockImplementation(() => {
			throw new Error("schema explode");
		});
		try {
			await drain(
				instructionsProcessor.runAsync(
					{ agent } as unknown as InvocationContext,
					llmRequest,
				),
			);
			expect(llmRequest.getSystemInstructionText()).toBeUndefined();
		} finally {
			toJSONSchema.mockRestore();
		}
	});
});

describe("nl-planning leftover: getPlanner duck-typing + PlanReAct fallback", () => {
	const incompletePlanners = [
		{
			label: "missing processPlanningResponse",
			planner: { buildPlanningInstruction: () => "x" },
		},
		{
			label: "missing buildPlanningInstruction",
			planner: { processPlanningResponse: () => [] },
		},
		{ label: "empty object", planner: {} },
		{ label: "string planner", planner: "plan" },
		{ label: "number planner", planner: 1 },
	] as const;

	for (const { label, planner } of incompletePlanners) {
		it(`falls back to PlanReActPlanner for ${label}`, async () => {
			const llmRequest = new LlmRequest();
			await drain(
				nlPlanningRequestProcessor.runAsync(
					makeNlContext({
						agent: { name: "planner-agent", planner },
					}),
					llmRequest,
				),
			);
			expect(String(llmRequest.config?.systemInstruction || "")).toContain(
				"PLANNING",
			);
		});
	}

	it("returns null when planner key is missing or falsy", async () => {
		for (const agent of [
			{ name: "a" },
			{ name: "a", planner: null },
			{ name: "a", planner: undefined },
			{ name: "a", planner: false },
			{ name: "a", planner: 0 },
			{ name: "a", planner: "" },
		]) {
			const llmRequest = new LlmRequest();
			await drain(
				nlPlanningRequestProcessor.runAsync(
					makeNlContext({ agent }),
					llmRequest,
				),
			);
			expect(llmRequest.config?.systemInstruction).toBeUndefined();
		}
	});
});

describe("nl-planning leftover: removeThought + response processedParts coalesce", () => {
	it("clears thought on mixed parts and skips contents without parts", async () => {
		const llmRequest = new LlmRequest();
		llmRequest.contents = [
			{
				role: "user",
				parts: [
					{ text: "a", thought: true } as any,
					{ text: "b", thought: false } as any,
					{ text: "c" },
				],
			},
			{ role: "model", parts: undefined as any },
			{ role: "user", parts: null as any },
			{
				role: "model",
				parts: [{ text: "d", thought: true } as any],
			},
		];
		await drain(
			nlPlanningRequestProcessor.runAsync(
				makeNlContext({
					agent: {
						name: "planner-agent",
						planner: new PlanReActPlanner(),
					},
				}),
				llmRequest,
			),
		);
		expect((llmRequest.contents[0].parts![0] as any).thought).toBeUndefined();
		expect((llmRequest.contents[0].parts![1] as any).thought).toBeUndefined();
		expect(llmRequest.contents[0].parts![2]).toEqual({ text: "c" });
		expect((llmRequest.contents[3].parts![0] as any).thought).toBeUndefined();
	});

	it("skips append when buildPlanningInstruction returns falsy", async () => {
		const falsyInstructions = ["", null, undefined, 0, false] as const;
		for (const value of falsyInstructions) {
			const llmRequest = new LlmRequest();
			await drain(
				nlPlanningRequestProcessor.runAsync(
					makeNlContext({
						agent: {
							name: "planner-agent",
							planner: {
								buildPlanningInstruction: () => value as any,
								processPlanningResponse: vi.fn(),
							},
						},
					}),
					llmRequest,
				),
			);
			expect(llmRequest.config?.systemInstruction).toBeUndefined();
		}
	});

	const falsyProcessed: Array<{ label: string; value: unknown }> = [
		{ label: "undefined", value: undefined },
		{ label: "null", value: null },
		{ label: "false", value: false },
		{ label: "0", value: 0 },
		{ label: '""', value: "" },
	];

	for (const { label, value } of falsyProcessed) {
		it(`keeps original parts when processPlanningResponse returns ${label}`, async () => {
			const original = [{ text: "keep" }];
			const planner = {
				buildPlanningInstruction: vi.fn(),
				processPlanningResponse: () => value as any,
			};
			const llmResponse = {
				content: { role: "model", parts: original },
			} as LlmResponse;
			await drain(
				nlPlanningResponseProcessor.runAsync(
					makeNlContext({ agent: { name: "planner-agent", planner } }),
					llmResponse,
				),
			);
			expect(llmResponse.content?.parts).toBe(original);
		});
	}

	it("replaces parts when processPlanningResponse returns empty array (truthy)", async () => {
		const planner = {
			buildPlanningInstruction: vi.fn(),
			processPlanningResponse: () => [],
		};
		const llmResponse = {
			content: { role: "model", parts: [{ text: "old" }] },
		} as LlmResponse;
		await drain(
			nlPlanningResponseProcessor.runAsync(
				makeNlContext({ agent: { name: "planner-agent", planner } }),
				llmResponse,
			),
		);
		expect(llmResponse.content?.parts).toEqual([]);
	});

	it("BuiltInPlanner applies thinkingConfig without appending PlanReAct text", async () => {
		const thinkingConfig = { includeThoughts: true, thinkingBudget: 8 };
		const llmRequest = new LlmRequest();
		await drain(
			nlPlanningRequestProcessor.runAsync(
				makeNlContext({
					agent: {
						name: "planner-agent",
						planner: new BuiltInPlanner({ thinkingConfig }),
					},
				}),
				llmRequest,
			),
		);
		expect((llmRequest.config as any).thinkingConfig).toEqual(thinkingConfig);
	});
});
