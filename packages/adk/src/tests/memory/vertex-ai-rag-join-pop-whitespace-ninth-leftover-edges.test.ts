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

import type { Event } from "../../events/event";
import {
	rag,
	VertexAiRagMemoryService,
} from "../../memory/vertex-ai-rag-memory-service";
import type { Session } from "../../sessions/session";

function makeSession(overrides?: Partial<Session>): Session {
	return {
		id: "sess-9",
		appName: "app",
		userId: "user",
		state: {},
		events: [],
		lastUpdateTime: 1,
		...overrides,
	};
}

describe("VertexAiRagMemoryService join/pop/whitespace ninth leftover (beyond #170)", () => {
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

	it('multipart part.text uses join(".") not space/newline', async () => {
		const service = new VertexAiRagMemoryService("corpus-1");
		const upload = vi.spyOn(rag, "upload_file").mockResolvedValue(undefined);
		await service.addSessionToMemory(
			makeSession({
				events: [
					{
						author: "user",
						timestamp: 1,
						content: {
							parts: [{ text: "hello" }, { text: "world" }, { text: "!" }],
						},
					} as Event,
				],
			}),
		);
		expect(writeFileSync).toHaveBeenCalled();
		const body = writeFileSync.mock.calls[0][1] as string;
		const parsed = JSON.parse(body.trim());
		expect(parsed.text).toBe("hello.world.!");
		expect(upload).toHaveBeenCalled();
	});

	it('whitespace-only part.text " " is truthy and kept (asymmetry vs "")', async () => {
		const service = new VertexAiRagMemoryService("corpus-1");
		vi.spyOn(rag, "upload_file").mockResolvedValue(undefined);
		await service.addSessionToMemory(
			makeSession({
				events: [
					{
						author: "user",
						timestamp: 2,
						content: { parts: [{ text: " " }, { text: "" }, { text: "kept" }] },
					} as Event,
				],
			}),
		);
		const body = writeFileSync.mock.calls[0][1] as string;
		const parsed = JSON.parse(body.trim());
		expect(parsed.text).toBe(" .kept");
	});

	it("source_display_name.split('.').pop() keeps only the last segment as sessionId", async () => {
		const service = new VertexAiRagMemoryService("corpus-1");
		vi.spyOn(rag, "retrieval_query").mockResolvedValue({
			contexts: {
				contexts: [
					{
						source_display_name: "app.user.a.b.c",
						text: JSON.stringify({
							author: "user",
							timestamp: 1000,
							text: "deep",
						}),
					},
				],
			},
		});
		const result = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "q",
		});
		expect(result.memories).toHaveLength(1);
		expect(result.memories[0].content?.parts?.[0]?.text).toBe("deep");
	});

	it.each([
		{ display: "App.user.sess", appName: "app", userId: "user", keep: false },
		{ display: "app.User.sess", appName: "app", userId: "user", keep: false },
		{ display: "app.user.sess", appName: "app", userId: "user", keep: true },
		{ display: "app.userX.sess", appName: "app", userId: "user", keep: false },
		{ display: "app.user.sess", appName: "app", userId: "userX", keep: false },
		{ display: "app.user", appName: "app", userId: "user", keep: false },
	])("prefix filter startsWith case/near-miss $display keep=$keep", async ({
		display,
		appName,
		userId,
		keep,
	}) => {
		const service = new VertexAiRagMemoryService("corpus-1");
		vi.spyOn(rag, "retrieval_query").mockResolvedValue({
			contexts: {
				contexts: [
					{
						source_display_name: display,
						text: JSON.stringify({
							author: "user",
							timestamp: 5,
							text: "hit",
						}),
					},
				],
			},
		});
		const result = await service.searchMemory({
			appName,
			userId,
			query: "q",
		});
		expect(result.memories).toHaveLength(keep ? 1 : 0);
	});

	it("invalid timestamp string → parseFloat NaN → formatTimestamp RangeError", async () => {
		const service = new VertexAiRagMemoryService("corpus-1");
		vi.spyOn(rag, "retrieval_query").mockResolvedValue({
			contexts: {
				contexts: [
					{
						source_display_name: "app.user.sess",
						text: JSON.stringify({
							author: "user",
							timestamp: "not-a-number",
							text: "x",
						}),
					},
				],
			},
		});
		await expect(
			service.searchMemory({ appName: "app", userId: "user", query: "q" }),
		).rejects.toThrow(RangeError);
	});

	it("newline in part.text is replaced with space before JSON upload", async () => {
		const service = new VertexAiRagMemoryService("corpus-1");
		vi.spyOn(rag, "upload_file").mockResolvedValue(undefined);
		await service.addSessionToMemory(
			makeSession({
				events: [
					{
						author: "user",
						timestamp: 3,
						content: { parts: [{ text: "line1\nline2" }] },
					} as Event,
				],
			}),
		);
		const body = writeFileSync.mock.calls[0][1] as string;
		expect(body).not.toContain("\nline2");
		expect(JSON.parse(body.trim()).text).toBe("line1 line2");
	});
});
