import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VertexAiSessionService } from "../../sessions/vertex-ai-session-service";

/**
 * Fifteenth leftover: httpHeaders early-return only on the first events page;
 * later pages with httpHeaders still append sessionEvents.
 */
describe("vertex-ai paginated httpHeaders ignored fifteenth leftover", () => {
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

	it("page2 httpHeaders does not drop page2 sessionEvents", async () => {
		const { service, asyncRequest } = createService();
		asyncRequest
			.mockResolvedValueOnce({
				name: "projects/p/locations/l/reasoningEngines/9/sessions/sess-pg",
				updateTime: "2024-01-01T00:00:30.000Z",
				sessionState: {},
			})
			.mockResolvedValueOnce({
				nextPageToken: "tok",
				sessionEvents: [
					{
						name: ".../events/e0",
						invocationId: "i0",
						author: "user",
						timestamp: "2024-01-01T00:00:05.000Z",
						content: { parts: [{ text: "page1" }] },
					},
				],
			})
			.mockResolvedValueOnce({
				httpHeaders: { "x-empty": "1" },
				sessionEvents: [
					{
						name: ".../events/e1",
						invocationId: "i1",
						author: "agent",
						timestamp: "2024-01-01T00:00:15.000Z",
						content: { parts: [{ text: "page2-kept" }] },
					},
				],
			});

		const session = await service.getSession("app", "u", "sess-pg");
		expect(session?.events.map((e) => e.content?.parts?.[0]?.text)).toEqual([
			"page1",
			"page2-kept",
		]);
	});
});
