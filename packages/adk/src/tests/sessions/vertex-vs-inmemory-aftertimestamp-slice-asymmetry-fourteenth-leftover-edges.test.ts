import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InMemorySessionService } from "../../sessions/in-memory-session-service";
import { VertexAiSessionService } from "../../sessions/vertex-ai-session-service";

/**
 * Fourteenth leftover: afterTimestamp walk finds first event with
 * `timestamp < afterTimestamp`, then Vertex does `slice(i)` (includes it)
 * while in-memory does `slice(i + 1)` (excludes it).
 */
describe("vertex-vs-inmemory afterTimestamp slice asymmetry fourteenth leftover", () => {
	beforeEach(() => {
		vi.spyOn(console, "debug").mockImplementation(() => undefined);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("Vertex slice(i) keeps the pre-threshold event; in-memory slice(i+1) drops it", async () => {
		const afterTimestamp = 15;

		const memory = new InMemorySessionService();
		const memSession = await memory.createSession("app", "u", {}, "mem");
		for (const [id, ts, text] of [
			["e0", 1, "old"],
			["e1", 10, "mid"],
			["e2", 20, "new"],
		] as const) {
			await memory.appendEvent(memSession, {
				id,
				author: "user",
				timestamp: ts,
				content: { parts: [{ text }] },
			} as any);
		}
		const memFetched = await memory.getSession("app", "u", "mem", {
			afterTimestamp,
		});
		expect(memFetched?.events.map((e) => e.content?.parts?.[0]?.text)).toEqual([
			"new",
		]);

		const asyncRequest = vi.fn();
		const vertex = new VertexAiSessionService({ agentEngineId: "9" });
		(vertex as any).getApiClient = () => ({ async_request: asyncRequest });
		asyncRequest
			.mockResolvedValueOnce({
				name: "projects/p/locations/l/reasoningEngines/9/sessions/vtx",
				updateTime: "2024-01-01T00:00:30.000Z",
				sessionState: {},
			})
			.mockResolvedValueOnce({
				sessionEvents: [
					{
						name: ".../events/e0",
						invocationId: "i0",
						author: "user",
						timestamp: "2024-01-01T00:00:01.000Z",
						content: { parts: [{ text: "old" }] },
					},
					{
						name: ".../events/e1",
						invocationId: "i1",
						author: "agent",
						timestamp: "2024-01-01T00:00:10.000Z",
						content: { parts: [{ text: "mid" }] },
					},
					{
						name: ".../events/e2",
						invocationId: "i2",
						author: "user",
						timestamp: "2024-01-01T00:00:20.000Z",
						content: { parts: [{ text: "new" }] },
					},
				],
			});

		const vtxFetched = await vertex.getSession("app", "u", "vtx", {
			afterTimestamp: Date.parse("2024-01-01T00:00:15.000Z") / 1000,
		});
		expect(vtxFetched?.events.map((e) => e.content?.parts?.[0]?.text)).toEqual([
			"mid",
			"new",
		]);
	});
});
