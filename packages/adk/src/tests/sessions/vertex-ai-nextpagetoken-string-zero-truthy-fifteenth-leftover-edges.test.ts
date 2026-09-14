import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VertexAiSessionService } from "../../sessions/vertex-ai-session-service";

/**
 * Fifteenth leftover: `while (nextPageToken)` — string "0" / " " are truthy and
 * continue pagination; numeric 0 / false / "" stop.
 */
describe("vertex-ai nextPageToken string-zero truthy fifteenth leftover", () => {
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

	it('nextPageToken: "0" continues to second page', async () => {
		const { service, asyncRequest } = createService();
		asyncRequest
			.mockResolvedValueOnce({
				name: "projects/p/locations/l/reasoningEngines/9/sessions/sess-p",
				updateTime: "2024-01-01T00:00:30.000Z",
				sessionState: {},
			})
			.mockResolvedValueOnce({
				nextPageToken: "0",
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
				sessionEvents: [
					{
						name: ".../events/e1",
						invocationId: "i1",
						author: "agent",
						timestamp: "2024-01-01T00:00:15.000Z",
						content: { parts: [{ text: "page2" }] },
					},
				],
			});

		const session = await service.getSession("app", "u", "sess-p");
		expect(asyncRequest).toHaveBeenCalledTimes(3);
		expect(session?.events.map((e) => e.content?.parts?.[0]?.text)).toEqual([
			"page1",
			"page2",
		]);
		const page2Path = asyncRequest.mock.calls[2][0].path as string;
		expect(page2Path).toContain("pageToken=0");
	});

	it("numeric nextPageToken 0 stops pagination (control)", async () => {
		const { service, asyncRequest } = createService();
		asyncRequest
			.mockResolvedValueOnce({
				name: "projects/p/locations/l/reasoningEngines/9/sessions/sess-n",
				updateTime: "2024-01-01T00:00:30.000Z",
				sessionState: {},
			})
			.mockResolvedValueOnce({
				nextPageToken: 0,
				sessionEvents: [
					{
						name: ".../events/e0",
						invocationId: "i0",
						author: "user",
						timestamp: "2024-01-01T00:00:05.000Z",
						content: { parts: [{ text: "only" }] },
					},
				],
			});

		const session = await service.getSession("app", "u", "sess-n");
		expect(asyncRequest).toHaveBeenCalledTimes(2);
		expect(session?.events.map((e) => e.content?.parts?.[0]?.text)).toEqual([
			"only",
		]);
	});
});
