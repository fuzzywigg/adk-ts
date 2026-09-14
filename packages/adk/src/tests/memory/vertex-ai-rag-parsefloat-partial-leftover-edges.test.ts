import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:fs")>();
	return {
		...actual,
		unlinkSync: vi.fn(),
		writeFileSync: vi.fn(),
	};
});

import {
	rag,
	VertexAiRagMemoryService,
} from "../../memory/vertex-ai-rag-memory-service";

function jsonLine(
	author: string,
	timestamp: number | string,
	text: string,
): string {
	return JSON.stringify({ author, timestamp, text });
}

describe("VertexAiRagMemoryService leftover: Number.parseFloat partial parses", () => {
	beforeEach(() => {
		vi.spyOn(console, "log").mockImplementation(() => undefined);
		vi.spyOn(console, "warn").mockImplementation(() => undefined);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	const partials: Array<{ raw: string; expectedMs: number }> = [
		{ raw: "1700abc", expectedMs: 1700 },
		{ raw: "99.5xyz", expectedMs: 99.5 },
		{ raw: "0xff", expectedMs: 0 },
		{ raw: "12e3more", expectedMs: 12000 },
		{ raw: "1.5e2trail", expectedMs: 150 },
		{ raw: "42.0px", expectedMs: 42 },
	];

	for (const { raw, expectedMs } of partials) {
		it(`silently accepts partial parse of ${JSON.stringify(raw)} → ${expectedMs}`, async () => {
			vi.spyOn(rag, "retrieval_query").mockResolvedValue({
				contexts: {
					contexts: [
						{
							source_display_name: "app.user.s1",
							text: jsonLine("u", raw, "partial"),
						},
					],
				},
			});
			const service = new VertexAiRagMemoryService("corpus");
			const result = await service.searchMemory({
				appName: "app",
				userId: "user",
				query: "q",
			});
			expect(result.memories).toHaveLength(1);
			expect(result.memories[0].timestamp).toBe(
				new Date(expectedMs).toISOString(),
			);
		});
	}
});
