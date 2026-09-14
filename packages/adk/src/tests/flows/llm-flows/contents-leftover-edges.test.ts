import { describe, expect, it, vi } from "vitest";
import type { InvocationContext } from "../../../agents/invocation-context";
import { Event } from "../../../events/event";
import { requestProcessor } from "../../../flows/llm-flows/contents";
import { REQUEST_EUC_FUNCTION_CALL_NAME } from "../../../flows/llm-flows/functions";
import { LlmRequest } from "../../../models/llm-request";

vi.mock("../../../logger", () => ({
	Logger: vi.fn(() => ({
		debug: vi.fn(),
		error: vi.fn(),
		warn: vi.fn(),
		info: vi.fn(),
	})),
}));

async function drain(
	gen: AsyncGenerator<unknown, void, unknown>,
): Promise<void> {
	for await (const _ of gen) {
		/* no events expected */
	}
}

function userEvent(
	text: string,
	opts: Partial<{
		branch: string;
		invocationId: string;
		timestamp: number;
	}> = {},
): Event {
	return new Event({
		author: "user",
		content: { role: "user", parts: [{ text }] },
		branch: opts.branch,
		invocationId: opts.invocationId,
		timestamp: opts.timestamp,
	});
}

function agentEvent(
	author: string,
	text: string,
	opts: Partial<{
		branch: string;
		invocationId: string;
		timestamp: number;
	}> = {},
): Event {
	return new Event({
		author,
		content: { role: "model", parts: [{ text }] },
		branch: opts.branch,
		invocationId: opts.invocationId,
		timestamp: opts.timestamp,
	});
}

function duckAgent(
	name: string,
	includeContents: "default" | "none",
): {
	name: string;
	canonicalModel: string;
	includeContents: "default" | "none";
} {
	return {
		name,
		canonicalModel: "gpt-4o",
		includeContents,
	};
}

function ctx(
	agent: object,
	events: Event[],
	branch?: string,
): InvocationContext {
	return {
		agent,
		branch,
		session: { events },
		runConfig: {},
	} as unknown as InvocationContext;
}

describe("contents leftover edges via requestProcessor", () => {
	const authMatrix: Array<{
		label: string;
		build: () => Event;
	}> = [
		{
			label: "EUC functionCall only",
			build: () =>
				new Event({
					author: "assistant",
					content: {
						role: "model",
						parts: [
							{
								functionCall: {
									id: "euc-1",
									name: REQUEST_EUC_FUNCTION_CALL_NAME,
									args: {},
								},
							},
						],
					},
				}),
		},
		{
			label: "EUC functionResponse only",
			build: () =>
				new Event({
					author: "user",
					content: {
						role: "user",
						parts: [
							{
								functionResponse: {
									id: "euc-1",
									name: REQUEST_EUC_FUNCTION_CALL_NAME,
									response: { ok: true },
								},
							},
						],
					},
				}),
		},
		{
			label: "EUC call mixed with text still auth",
			build: () =>
				new Event({
					author: "assistant",
					content: {
						role: "model",
						parts: [
							{ text: "need auth" },
							{
								functionCall: {
									id: "euc-2",
									name: REQUEST_EUC_FUNCTION_CALL_NAME,
									args: { scope: "x" },
								},
							},
						],
					},
				}),
		},
	];

	for (const { label, build } of authMatrix) {
		it(`skips auth event: ${label}`, async () => {
			const llmRequest = new LlmRequest();
			await drain(
				requestProcessor.runAsync(
					ctx(duckAgent("assistant", "default"), [build(), userEvent("go")]),
					llmRequest,
				),
			);
			expect(
				llmRequest.contents.some((c) =>
					c.parts?.some(
						(p) =>
							p.functionCall?.name === REQUEST_EUC_FUNCTION_CALL_NAME ||
							p.functionResponse?.name === REQUEST_EUC_FUNCTION_CALL_NAME,
					),
				),
			).toBe(false);
			expect(llmRequest.contents.map((c) => c.parts?.[0]?.text)).toContain(
				"go",
			);
		});
	}

	it("skips content with role but empty parts array", async () => {
		const llmRequest = new LlmRequest();
		const emptyParts = new Event({
			author: "assistant",
			content: { role: "model", parts: [] },
		});
		await drain(
			requestProcessor.runAsync(
				ctx(duckAgent("assistant", "default"), [
					emptyParts,
					userEvent("after-empty"),
				]),
				llmRequest,
			),
		);
		expect(llmRequest.contents.map((c) => c.parts?.[0]?.text)).toEqual([
			"after-empty",
		]);
	});

	const foreignArgsMatrix: Array<{
		label: string;
		args: unknown;
		expectedSnippet: string;
	}> = [
		{ label: "null args", args: null, expectedSnippet: "null" },
		{
			label: "undefined args",
			args: undefined,
			expectedSnippet: undefined as any,
		},
		{ label: "empty object args", args: {}, expectedSnippet: "{}" },
		{ label: "string args", args: "raw", expectedSnippet: '"raw"' },
	];

	for (const { label, args, expectedSnippet } of foreignArgsMatrix) {
		it(`foreign functionCall stringifies ${label}`, async () => {
			const llmRequest = new LlmRequest();
			const foreign = new Event({
				author: "peer",
				content: {
					role: "model",
					parts: [
						{
							functionCall: {
								id: "fc",
								name: "lookup",
								args: args as any,
							},
						},
					],
				},
			});

			await drain(
				requestProcessor.runAsync(
					ctx(duckAgent("assistant", "default"), [foreign, userEvent("cont")]),
					llmRequest,
				),
			);

			const rewritten = llmRequest.contents[0];
			expect(rewritten.role).toBe("user");
			const toolText = rewritten.parts?.find((p) =>
				p.text?.includes("called tool `lookup`"),
			)?.text;
			expect(toolText).toBeDefined();
			if (expectedSnippet !== undefined) {
				expect(toolText).toContain(expectedSnippet);
			} else {
				// Template concat of JSON.stringify(undefined) becomes the literal "undefined"
				expect(toolText).toContain("parameters: undefined");
			}
		});
	}

	it("merges multiple async FR events with extra non-id parts", async () => {
		const llmRequest = new LlmRequest();
		const call = new Event({
			author: "assistant",
			content: {
				role: "model",
				parts: [
					{ functionCall: { id: "c1", name: "tool_a", args: {} } },
					{ functionCall: { id: "c2", name: "tool_b", args: {} } },
				],
			},
		});
		const fr1 = new Event({
			author: "user",
			content: {
				role: "user",
				parts: [
					{
						functionResponse: {
							id: "c1",
							name: "tool_a",
							response: { a: 1 },
						},
					},
					{ text: "extra-note-1" },
				],
			},
		});
		const fr2 = new Event({
			author: "user",
			content: {
				role: "user",
				parts: [
					{
						functionResponse: {
							id: "c2",
							name: "tool_b",
							response: { b: 2 },
						},
					},
					{ text: "extra-note-2" },
					{ inlineData: { mimeType: "text/plain", data: "eQ==" } },
				],
			},
		});

		await drain(
			requestProcessor.runAsync(
				ctx(duckAgent("assistant", "default"), [
					userEvent("start"),
					call,
					fr1,
					fr2,
				]),
				llmRequest,
			),
		);

		const frContents = llmRequest.contents.filter((c) =>
			c.parts?.some((p) => p.functionResponse),
		);
		expect(frContents.length).toBeGreaterThanOrEqual(1);
		const mergedParts = frContents.flatMap((c) => c.parts || []);
		expect(mergedParts.some((p) => p.functionResponse?.id === "c1")).toBe(true);
		expect(mergedParts.some((p) => p.functionResponse?.id === "c2")).toBe(true);
		expect(mergedParts.some((p) => p.text === "extra-note-1")).toBe(true);
		expect(mergedParts.some((p) => p.text === "extra-note-2")).toBe(true);
		expect(
			mergedParts.some((p) => p.inlineData?.mimeType === "text/plain"),
		).toBe(true);
	});

	it("getCurrentTurnContents returns [] when no user/other-agent events", async () => {
		const llmRequest = new LlmRequest();
		await drain(
			requestProcessor.runAsync(
				ctx(
					{
						name: "assistant",
						canonicalModel: "gpt-4o",
						includeContents: "current_turn",
					},
					[
						agentEvent("assistant", "only-self"),
						agentEvent("assistant", "still-self"),
					],
				),
				llmRequest,
			),
		);
		expect(llmRequest.contents).toEqual([]);
	});

	it("includeContents none leaves contents untouched (empty preset)", async () => {
		const llmRequest = new LlmRequest();
		await drain(
			requestProcessor.runAsync(
				ctx(
					duckAgent("assistant", "none"),
					[agentEvent("assistant", "hist", { invocationId: "old" })],
					"root",
				),
				llmRequest,
			),
		);
		expect(llmRequest.contents).toEqual([]);
	});

	const branchMatrix: Array<{
		label: string;
		branch: string;
		events: Event[];
		expectedTexts: string[];
	}> = [
		{
			label: "keeps ancestor and active leaf",
			branch: "root.leaf",
			events: [
				userEvent("root-shared", { branch: "root" }),
				userEvent("sibling", { branch: "root.sibling" }),
				userEvent("leaf", { branch: "root.leaf" }),
			],
			expectedTexts: ["root-shared", "leaf"],
		},
		{
			label: "undefined event branch included when invocation branch set",
			branch: "root",
			events: [
				userEvent("unbranched"),
				userEvent("other", { branch: "root.other" }),
				userEvent("match", { branch: "root" }),
			],
			expectedTexts: ["unbranched", "match"],
		},
		{
			label: "no invocation branch keeps all",
			branch: undefined as any,
			events: [
				userEvent("a", { branch: "x" }),
				userEvent("b", { branch: "y" }),
			],
			expectedTexts: ["a", "b"],
		},
		{
			label: "deep prefix matching",
			branch: "a.b.c",
			events: [
				userEvent("a", { branch: "a" }),
				userEvent("ab", { branch: "a.b" }),
				userEvent("abc", { branch: "a.b.c" }),
				userEvent("abd", { branch: "a.b.d" }),
			],
			expectedTexts: ["a", "ab", "abc"],
		},
	];

	for (const { label, branch, events, expectedTexts } of branchMatrix) {
		it(`branch prefix filtering: ${label}`, async () => {
			const llmRequest = new LlmRequest();
			await drain(
				requestProcessor.runAsync(
					ctx(duckAgent("assistant", "default"), events, branch),
					llmRequest,
				),
			);
			expect(llmRequest.contents.map((c) => c.parts?.[0]?.text)).toEqual(
				expectedTexts,
			);
		});
	}

	it("current_turn includeContents starts at latest user turn only", async () => {
		const llmRequest = new LlmRequest();
		await drain(
			requestProcessor.runAsync(
				ctx(
					{
						name: "assistant",
						canonicalModel: "gpt-4o",
						includeContents: "current_turn",
					},
					[
						userEvent("old"),
						agentEvent("assistant", "mid"),
						userEvent("latest"),
					],
				),
				llmRequest,
			),
		);
		expect(llmRequest.contents.map((c) => c.parts?.[0]?.text)).toEqual([
			"latest",
		]);
	});
});
