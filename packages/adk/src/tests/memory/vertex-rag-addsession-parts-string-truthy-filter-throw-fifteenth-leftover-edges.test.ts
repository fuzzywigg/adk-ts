import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { unlinkSync, writeFileSync } = vi.hoisted(() => ({
	unlinkSync: vi.fn(),
	writeFileSync: vi.fn(),
}));

vi.mock("node:fs", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:fs")>();
	return {
		...actual,
		unlinkSync,
		writeFileSync,
	};
});

import {
	rag,
	VertexAiRagMemoryService,
} from "../../memory/vertex-ai-rag-memory-service";
import type { Session } from "../../sessions/session";

/**
 * Fifteenth leftover: addSessionToMemory `!event.content.parts` — fourteenth
 * skips falsy primitives. Truthy non-array `"0"` / `"false"` pass the gate
 * then throw on `.filter`.
 */
describe("vertex-rag addSession parts string-truthy filter-throw fifteenth leftover", () => {
	beforeEach(() => {
		unlinkSync.mockReset();
		unlinkSync.mockImplementation(() => undefined);
		writeFileSync.mockReset();
		writeFileSync.mockImplementation(() => undefined);
		vi.spyOn(console, "log").mockImplementation(() => undefined);
		vi.spyOn(console, "warn").mockImplementation(() => undefined);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it.each([
		{ label: '"0"', parts: "0" },
		{ label: '"false"', parts: "false" },
	])("parts $label passes falsy gate then throws on .filter", async ({
		parts,
	}) => {
		const service = new VertexAiRagMemoryService("corpus-15");
		const session = {
			id: "sess",
			appName: "app",
			userId: "user",
			state: {},
			events: [
				{
					author: "user",
					timestamp: 1,
					content: { parts },
				},
			],
			lastUpdateTime: 1,
		} as Session;

		await expect(service.addSessionToMemory(session)).rejects.toThrow(
			/filter is not a function/,
		);
	});

	it("falsy parts false still skipped without throw (fourteenth control)", async () => {
		const service = new VertexAiRagMemoryService("corpus-15");
		const upload = vi.spyOn(rag, "upload_file").mockResolvedValue(undefined);
		await service.addSessionToMemory({
			id: "sess",
			appName: "app",
			userId: "user",
			state: {},
			events: [
				{
					author: "user",
					timestamp: 1,
					content: { parts: false },
				} as any,
			],
			lastUpdateTime: 1,
		} as Session);
		expect(upload).toHaveBeenCalled();
		const written = writeFileSync.mock.calls[0]?.[1] as string;
		expect(written).toBe("");
	});
});
