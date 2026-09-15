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
 * Twentieth leftover: addSessionToMemory `!event.content.parts` then
 * `.filter` — fifteenth pins string `"0"` / `"false"`. Boolean `true`,
 * number `1`, and empty object `{}` likewise pass the gate then throw
 * (same ladder as in-memory nineteenth/eighteenth, now on vertex add).
 */
describe("vertex-rag addSession parts true/one/object filter-throw twentieth leftover", () => {
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
		{ label: "boolean true", parts: true },
		{ label: "number 1", parts: 1 },
		{ label: "empty object {}", parts: {} },
	])("parts $label passes falsy gate then throws on .filter", async ({
		parts,
	}) => {
		const service = new VertexAiRagMemoryService("corpus-20");
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

	it('parts "0" still throws (fifteenth control)', async () => {
		const service = new VertexAiRagMemoryService("corpus-20");
		await expect(
			service.addSessionToMemory({
				id: "sess",
				appName: "app",
				userId: "user",
				state: {},
				events: [
					{
						author: "user",
						timestamp: 1,
						content: { parts: "0" },
					} as any,
				],
				lastUpdateTime: 1,
			} as Session),
		).rejects.toThrow(/filter is not a function/);
	});

	it("falsy parts false still skipped without throw (fourteenth control)", async () => {
		const service = new VertexAiRagMemoryService("corpus-20");
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
