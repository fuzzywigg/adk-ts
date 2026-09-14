import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VertexAiSessionService } from "../../sessions/vertex-ai-session-service";

/**
 * Fourteenth leftover: pagination builds
 * `pageToken=${encodeURIComponent(pageToken)}` — reserved chars stay encoded.
 */
describe("vertex-ai pageToken encodeURIComponent fourteenth leftover", () => {
	beforeEach(() => {
		vi.spyOn(console, "debug").mockImplementation(() => undefined);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("encodes &, =, /, and quotes in pageToken query value", async () => {
		const asyncRequest = vi.fn();
		const service = new VertexAiSessionService({ agentEngineId: "9" });
		(service as any).getApiClient = () => ({ async_request: asyncRequest });

		const rawToken = 'a&b=c/"x"';
		asyncRequest
			.mockResolvedValueOnce({
				name: "projects/p/locations/l/reasoningEngines/9/sessions/sess-p",
				updateTime: "2024-01-01T00:01:00.000Z",
				sessionState: {},
			})
			.mockResolvedValueOnce({
				sessionEvents: [
					{
						name: ".../events/e0",
						invocationId: "i0",
						author: "user",
						timestamp: "2024-01-01T00:00:10.000Z",
						content: { parts: [{ text: "p0" }] },
					},
				],
				nextPageToken: rawToken,
			})
			.mockResolvedValueOnce({
				sessionEvents: [
					{
						name: ".../events/e1",
						invocationId: "i1",
						author: "agent",
						timestamp: "2024-01-01T00:00:20.000Z",
						content: { parts: [{ text: "p1" }] },
					},
				],
			});

		const session = await service.getSession("app", "u", "sess-p");
		expect(session?.events).toHaveLength(2);
		expect(asyncRequest.mock.calls[2][0].path).toContain(
			`pageToken=${encodeURIComponent(rawToken)}`,
		);
		expect(asyncRequest.mock.calls[2][0].path).not.toContain("pageToken=a&b=");
	});
});
