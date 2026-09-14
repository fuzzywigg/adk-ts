import { describe, expect, it } from "vitest";
import { InMemoryMemoryService } from "../../memory/in-memory-memory-service";

describe("InMemoryMemoryService leftover searchMemory edges", () => {
	function injectEvents(
		service: InMemoryMemoryService,
		events: unknown[],
		userKey = "app/user",
		sessionId = "s1",
	) {
		(service as any)._sessionEvents.set(
			userKey,
			new Map([[sessionId, events]]),
		);
	}

	it("skips events without content/parts then matches keyword zebra", async () => {
		const service = new InMemoryMemoryService();
		injectEvents(service, [
			{ author: "a" },
			{ author: "b", content: undefined },
			{ author: "c", content: {} },
			{
				author: "d",
				content: { parts: [{ text: "findable keyword zebra" }] },
			},
		]);

		const result = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "zebra",
		});

		expect(result.memories).toHaveLength(1);
		expect(result.memories[0].author).toBe("d");
		expect(result.memories[0].content.parts?.[0]?.text).toContain("zebra");
	});

	const skipMatrix: Array<{
		label: string;
		events: unknown[];
		query: string;
		expectedAuthors: string[];
	}> = [
		{
			label: "missing content",
			events: [
				{ author: "skip" },
				{ author: "hit", content: { parts: [{ text: "alpha beta" }] } },
			],
			query: "alpha",
			expectedAuthors: ["hit"],
		},
		{
			label: "content undefined",
			events: [
				{ author: "skip", content: undefined },
				{ author: "hit", content: { parts: [{ text: "gamma delta" }] } },
			],
			query: "gamma",
			expectedAuthors: ["hit"],
		},
		{
			label: "content null",
			events: [
				{ author: "skip", content: null },
				{ author: "hit", content: { parts: [{ text: "epsilon" }] } },
			],
			query: "epsilon",
			expectedAuthors: ["hit"],
		},
		{
			label: "content without parts",
			events: [
				{ author: "skip", content: {} },
				{ author: "hit", content: { parts: [{ text: "zeta" }] } },
			],
			query: "zeta",
			expectedAuthors: ["hit"],
		},
		{
			label: "content.parts null",
			events: [
				{ author: "skip", content: { parts: null } },
				{ author: "hit", content: { parts: [{ text: "eta" }] } },
			],
			query: "eta",
			expectedAuthors: ["hit"],
		},
		{
			label: "content.parts undefined",
			events: [
				{ author: "skip", content: { parts: undefined } },
				{ author: "hit", content: { parts: [{ text: "theta" }] } },
			],
			query: "theta",
			expectedAuthors: ["hit"],
		},
		{
			label: "empty parts array (truthy parts, empty words)",
			events: [
				{ author: "empty-parts", content: { parts: [] } },
				{ author: "hit", content: { parts: [{ text: "iota" }] } },
			],
			query: "iota",
			expectedAuthors: ["hit"],
		},
		{
			label: "parts with no text",
			events: [
				{
					author: "no-text",
					content: { parts: [{ inlineData: { data: "x" } }, {}] },
				},
				{ author: "hit", content: { parts: [{ text: "kappa" }] } },
			],
			query: "kappa",
			expectedAuthors: ["hit"],
		},
		{
			label: "parts with empty/falsy text only",
			events: [
				{
					author: "blank",
					content: {
						parts: [{ text: "" }, { text: null }, { text: undefined }],
					},
				},
				{ author: "hit", content: { parts: [{ text: "lambda" }] } },
			],
			query: "lambda",
			expectedAuthors: ["hit"],
		},
		{
			label: "multiple skips then match",
			events: [
				{ author: "a" },
				{ author: "b", content: undefined },
				{ author: "c", content: {} },
				{ author: "d", content: { parts: null } },
				{ author: "e", content: { parts: [] } },
				{
					author: "f",
					content: { parts: [{ functionCall: { name: "x", args: {} } }] },
				},
				{
					author: "match",
					content: { parts: [{ text: "findable keyword zebra" }] },
				},
			],
			query: "zebra",
			expectedAuthors: ["match"],
		},
		{
			label: "no matches after skips",
			events: [
				{ author: "a" },
				{ author: "b", content: {} },
				{ author: "c", content: { parts: [{ text: "unrelated words" }] } },
			],
			query: "zebra",
			expectedAuthors: [],
		},
		{
			label: "query word in event with mixed skippable peers",
			events: [
				{ author: "skip1", content: { parts: [] } },
				{
					author: "hit",
					content: {
						parts: [{ text: "one" }, { text: "" }, { text: "zebra two" }],
					},
				},
				{ author: "skip2" },
			],
			query: "zebra",
			expectedAuthors: ["hit"],
		},
	];

	for (const { label, events, query, expectedAuthors } of skipMatrix) {
		it(`matrix: ${label}`, async () => {
			const service = new InMemoryMemoryService();
			injectEvents(service, events);
			const result = await service.searchMemory({
				appName: "app",
				userId: "user",
				query,
			});
			expect(result.memories.map((m) => m.author)).toEqual(expectedAuthors);
		});
	}

	it("searches across injected sessions under the same user key", async () => {
		const service = new InMemoryMemoryService();
		(service as any)._sessionEvents.set(
			"app/user",
			new Map([
				[
					"s1",
					[
						{ author: "a" },
						{ author: "b", content: { parts: [{ text: "zebra one" }] } },
					],
				],
				[
					"s2",
					[
						{ author: "c", content: {} },
						{ author: "d", content: { parts: [{ text: "zebra two" }] } },
					],
				],
			]),
		);

		const result = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "zebra",
		});
		expect(result.memories.map((m) => m.author).sort()).toEqual(["b", "d"]);
	});
});
