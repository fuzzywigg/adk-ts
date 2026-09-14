import { describe, expect, it, vi } from "vitest";
import type { InvocationContext } from "../../../agents/invocation-context";
import { Event } from "../../../events/event";
import { sharedMemoryRequestProcessor } from "../../../flows/llm-flows/shared-memory";
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

function makeContext(
	overrides: Partial<{
		memoryService: InvocationContext["memoryService"];
		events: Event[];
		contents: LlmRequest["contents"] | null | undefined;
		deleteContents: boolean;
	}> = {},
): { context: InvocationContext; llmRequest: LlmRequest } {
	const llmRequest = new LlmRequest();
	if (overrides.deleteContents) {
		delete (llmRequest as any).contents;
	} else if (overrides.contents !== undefined) {
		(llmRequest as any).contents = overrides.contents;
	}

	const context = {
		appName: "app",
		userId: "u1",
		agent: { name: "agent" },
		memoryService: overrides.memoryService,
		session: {
			id: "s1",
			appName: "app",
			userId: "u1",
			state: {},
			events: overrides.events ?? [],
			lastUpdateTime: 0,
		},
	} as unknown as InvocationContext;

	return { context, llmRequest };
}

describe('shared-memory leftover: p.text || "" on query parts', () => {
	const queryPartMatrix: Array<{
		label: string;
		parts: unknown[];
		expectedQuery: string;
	}> = [
		{
			label: "undefined text coalesces to empty",
			parts: [{}, { text: "keep" }],
			expectedQuery: " keep",
		},
		{
			label: "null text coalesces to empty",
			parts: [{ text: null }, { text: "x" }],
			expectedQuery: " x",
		},
		{
			label: "empty string text stays empty",
			parts: [{ text: "" }, { text: "y" }],
			expectedQuery: " y",
		},
		{
			label: "all falsy texts become spaces only",
			parts: [{}, { text: "" }, { text: null }],
			expectedQuery: "  ",
		},
		{
			label: "mixed text and non-text parts",
			parts: [
				{ text: "a" },
				{ inlineData: { mimeType: "text/plain", data: "eQ==" } },
				{ text: "b" },
			],
			expectedQuery: "a  b",
		},
		{
			label: "single empty text",
			parts: [{ text: "" }],
			expectedQuery: "",
		},
	];

	for (const { label, parts, expectedQuery } of queryPartMatrix) {
		it(`query join: ${label}`, async () => {
			const searchMemory = vi.fn(async () => ({ memories: [] }));
			const { context, llmRequest } = makeContext({
				memoryService: { searchMemory } as any,
				events: [
					new Event({
						author: "user",
						content: { role: "user", parts: parts as any },
					}),
				],
			});
			await drain(sharedMemoryRequestProcessor.runAsync(context, llmRequest));
			expect(searchMemory).toHaveBeenCalledWith(
				expect.objectContaining({ query: expectedQuery }),
			);
		});
	}
});

describe('shared-memory leftover: p.text || "" on memory parts', () => {
	const memoryPartMatrix: Array<{
		label: string;
		memoryParts: unknown[];
		expectedSuffix: string;
	}> = [
		{
			label: "undefined memory text",
			memoryParts: [{}],
			expectedSuffix: "[past] said: ",
		},
		{
			label: "null memory text",
			memoryParts: [{ text: null }],
			expectedSuffix: "[past] said: ",
		},
		{
			label: "empty + real",
			memoryParts: [{ text: "" }, { text: "fact" }],
			expectedSuffix: "[past] said:  fact",
		},
		{
			label: "multiple empty coalesces",
			memoryParts: [{}, { text: "" }, {}],
			expectedSuffix: "[past] said:   ",
		},
		{
			label: "normal text",
			memoryParts: [{ text: "remember" }],
			expectedSuffix: "[past] said: remember",
		},
	];

	for (const { label, memoryParts, expectedSuffix } of memoryPartMatrix) {
		it(`memory join: ${label}`, async () => {
			const searchMemory = vi.fn(async () => ({
				memories: [
					{
						author: "past",
						content: { role: "user", parts: memoryParts },
					},
				],
			}));
			const { context, llmRequest } = makeContext({
				memoryService: { searchMemory } as any,
				events: [
					new Event({
						author: "user",
						content: { role: "user", parts: [{ text: "q" }] },
					}),
				],
				contents: [],
			});
			await drain(sharedMemoryRequestProcessor.runAsync(context, llmRequest));
			expect(llmRequest.contents?.at(-1)?.parts?.[0]?.text).toBe(
				expectedSuffix,
			);
		});
	}
});

describe("shared-memory leftover: (contents || []).flatMap(parts||[])", () => {
	const sessionMatrix: Array<{
		label: string;
		contents: any;
		memoryText: string;
		shouldInject: boolean;
	}> = [
		{
			label: "undefined contents → empty session texts",
			contents: undefined,
			memoryText: "fresh-a",
			shouldInject: true,
		},
		{
			label: "null contents → empty session texts",
			contents: null,
			memoryText: "fresh-b",
			shouldInject: true,
		},
		{
			label: "content without parts → empty flatMap entry",
			contents: [{ role: "user" }],
			memoryText: "fresh-c",
			shouldInject: true,
		},
		{
			label: "parts null → || []",
			contents: [{ role: "user", parts: null }],
			memoryText: "fresh-d",
			shouldInject: true,
		},
		{
			label: "parts undefined → || []",
			contents: [{ role: "user", parts: undefined }],
			memoryText: "fresh-e",
			shouldInject: true,
		},
		{
			label: "parts with undefined text still in set",
			contents: [{ role: "user", parts: [{ text: undefined }] }],
			memoryText: "fresh-f",
			shouldInject: true,
		},
		{
			label: "matching session text skips inject",
			contents: [{ role: "user", parts: [{ text: "dup-text" }] }],
			memoryText: "dup-text",
			shouldInject: false,
		},
		{
			label: "empty parts array",
			contents: [{ role: "user", parts: [] }],
			memoryText: "fresh-g",
			shouldInject: true,
		},
		{
			label: "mixed valid and missing parts across contents",
			contents: [
				{ role: "user" },
				{ role: "model", parts: null },
				{ role: "user", parts: [{ text: "keep-out" }] },
			],
			memoryText: "keep-out",
			shouldInject: false,
		},
	];

	for (const { label, contents, memoryText, shouldInject } of sessionMatrix) {
		it(label, async () => {
			const searchMemory = vi.fn(async () => ({
				memories: [
					{
						author: "past",
						content: { role: "user", parts: [{ text: memoryText }] },
					},
				],
			}));
			const { context, llmRequest } = makeContext({
				memoryService: { searchMemory } as any,
				events: [
					new Event({
						author: "user",
						content: { role: "user", parts: [{ text: "query" }] },
					}),
				],
				contents,
			});
			const beforeLen = Array.isArray(llmRequest.contents)
				? llmRequest.contents.length
				: 0;
			await drain(sharedMemoryRequestProcessor.runAsync(context, llmRequest));
			if (shouldInject) {
				expect(llmRequest.contents?.at(-1)?.parts?.[0]?.text).toBe(
					`[past] said: ${memoryText}`,
				);
				expect((llmRequest.contents?.length ?? 0) >= beforeLen + 1).toBe(true);
			} else {
				expect(
					llmRequest.contents?.some((c) =>
						c.parts?.some((p) => p.text === `[past] said: ${memoryText}`),
					),
				).toBeFalsy();
			}
		});
	}
});

describe("shared-memory leftover: contents || [] before push", () => {
	it("initializes contents when deleted before push", async () => {
		const searchMemory = vi.fn(async () => ({
			memories: [
				{
					author: "past",
					content: { role: "user", parts: [{ text: "seeded" }] },
				},
			],
		}));
		const { context, llmRequest } = makeContext({
			memoryService: { searchMemory } as any,
			events: [
				new Event({
					author: "user",
					content: { role: "user", parts: [{ text: "q" }] },
				}),
			],
			deleteContents: true,
		});
		expect((llmRequest as any).contents).toBeUndefined();
		await drain(sharedMemoryRequestProcessor.runAsync(context, llmRequest));
		expect(Array.isArray(llmRequest.contents)).toBe(true);
		expect(llmRequest.contents).toHaveLength(1);
		expect(llmRequest.contents[0].parts?.[0]?.text).toBe("[past] said: seeded");
	});

	it("initializes contents when set to null before push", async () => {
		const searchMemory = vi.fn(async () => ({
			memories: [
				{
					author: "past",
					content: { role: "user", parts: [{ text: "from-null" }] },
				},
			],
		}));
		const { context, llmRequest } = makeContext({
			memoryService: { searchMemory } as any,
			events: [
				new Event({
					author: "user",
					content: { role: "user", parts: [{ text: "q" }] },
				}),
			],
			contents: null,
		});
		await drain(sharedMemoryRequestProcessor.runAsync(context, llmRequest));
		expect(llmRequest.contents).toEqual([
			{
				role: "user",
				parts: [{ text: "[past] said: from-null" }],
			},
		]);
	});

	it("appends when contents already present", async () => {
		const searchMemory = vi.fn(async () => ({
			memories: [
				{
					author: "past",
					content: { role: "user", parts: [{ text: "extra" }] },
				},
			],
		}));
		const { context, llmRequest } = makeContext({
			memoryService: { searchMemory } as any,
			events: [
				new Event({
					author: "user",
					content: { role: "user", parts: [{ text: "q" }] },
				}),
			],
			contents: [{ role: "user", parts: [{ text: "existing" }] }],
		});
		await drain(sharedMemoryRequestProcessor.runAsync(context, llmRequest));
		expect(llmRequest.contents).toHaveLength(2);
		expect(llmRequest.contents[0].parts?.[0]?.text).toBe("existing");
		expect(llmRequest.contents[1].parts?.[0]?.text).toBe("[past] said: extra");
	});

	it("pushes multiple non-duplicate memories onto coalesced contents", async () => {
		const searchMemory = vi.fn(async () => ({
			memories: [
				{
					author: "a",
					content: { role: "user", parts: [{ text: "m1" }] },
				},
				{
					author: "b",
					content: { role: "user", parts: [{ text: "m2" }] },
				},
				{
					author: "c",
					content: { role: "user", parts: [{ text: "m1" }] },
				},
			],
		}));
		const { context, llmRequest } = makeContext({
			memoryService: { searchMemory } as any,
			events: [
				new Event({
					author: "user",
					content: { role: "user", parts: [{ text: "q" }] },
				}),
			],
			deleteContents: true,
		});
		await drain(sharedMemoryRequestProcessor.runAsync(context, llmRequest));
		expect(llmRequest.contents?.map((c) => c.parts?.[0]?.text)).toEqual([
			"[a] said: m1",
			"[b] said: m2",
			"[c] said: m1",
		]);
	});
});

describe("shared-memory leftover: early exits still preserve coalesce safety", () => {
	it("no memoryService leaves undefined contents untouched", async () => {
		const { context, llmRequest } = makeContext({
			deleteContents: true,
			events: [
				new Event({
					author: "user",
					content: { role: "user", parts: [{ text: "q" }] },
				}),
			],
		});
		await drain(sharedMemoryRequestProcessor.runAsync(context, llmRequest));
		expect((llmRequest as any).contents).toBeUndefined();
	});

	it("no user event does not call searchMemory", async () => {
		const searchMemory = vi.fn();
		const { context, llmRequest } = makeContext({
			memoryService: { searchMemory } as any,
			events: [
				new Event({
					author: "agent",
					content: { role: "model", parts: [{ text: "only" }] },
				}),
			],
			deleteContents: true,
		});
		await drain(sharedMemoryRequestProcessor.runAsync(context, llmRequest));
		expect(searchMemory).not.toHaveBeenCalled();
		expect((llmRequest as any).contents).toBeUndefined();
	});
});
