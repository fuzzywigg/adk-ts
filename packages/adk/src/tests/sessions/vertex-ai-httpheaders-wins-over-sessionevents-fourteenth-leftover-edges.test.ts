import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VertexAiSessionService } from "../../sessions/vertex-ai-session-service";

/**
 * Fourteenth leftover: `if (listEventsApiResponse.httpHeaders) return session`
 * wins even when sessionEvents is also present — events are dropped.
 */
describe("vertex-ai httpHeaders wins over sessionEvents fourteenth leftover", () => {
	beforeEach(() => {
		vi.spyOn(console, "debug").mockImplementation(() => undefined);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	function createService() {
		const asyncRequest = vi.fn();
		const service = new VertexAiSessionService({ agentEngineId: "9" });
		(service as any).getApiClient = () => ({ async_request: asyncRequest });
		return { service, asyncRequest };
	}

	it("httpHeaders + sessionEvents still returns empty events", async () => {
		const { service, asyncRequest } = createService();
		asyncRequest
			.mockResolvedValueOnce({
				name: "projects/p/locations/l/reasoningEngines/9/sessions/sess-h",
				updateTime: "2024-01-01T00:00:30.000Z",
				sessionState: { keep: 1 },
			})
			.mockResolvedValueOnce({
				httpHeaders: { "x-empty": "1" },
				sessionEvents: [
					{
						name: ".../events/e1",
						invocationId: "i1",
						author: "user",
						timestamp: "2024-01-01T00:00:10.000Z",
						content: { parts: [{ text: "dropped" }] },
					},
				],
			});

		const session = await service.getSession("app", "u", "sess-h");
		expect(session?.state).toEqual({ keep: 1 });
		expect(session?.events).toEqual([]);
	});

	it("listSessions httpHeaders + sessions still returns []", async () => {
		const { service, asyncRequest } = createService();
		asyncRequest.mockResolvedValueOnce({
			httpHeaders: { "x-empty": "1" },
			sessions: [
				{
					name: ".../sessions/s1",
					updateTime: "2024-01-01T00:00:00.000Z",
				},
			],
		});
		await expect(service.listSessions("app", "u")).resolves.toEqual({
			sessions: [],
		});
	});

	it("sessionEvents alone still maps events (control)", async () => {
		const { service, asyncRequest } = createService();
		asyncRequest
			.mockResolvedValueOnce({
				name: "projects/p/locations/l/reasoningEngines/9/sessions/sess-c",
				updateTime: "2024-01-01T00:00:30.000Z",
				sessionState: {},
			})
			.mockResolvedValueOnce({
				sessionEvents: [
					{
						name: ".../events/e1",
						invocationId: "i1",
						author: "user",
						timestamp: "2024-01-01T00:00:10.000Z",
						content: { parts: [{ text: "kept" }] },
					},
				],
			});
		const session = await service.getSession("app", "u", "sess-c");
		expect(session?.events.map((e) => e.content?.parts?.[0]?.text)).toEqual([
			"kept",
		]);
	});
});
