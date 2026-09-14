import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VertexAiSessionService } from "../../sessions/vertex-ai-session-service";

/**
 * Leftover: Vertex getSession uses elif — falsy numRecentEvents: 0 falls through
 * to afterTimestamp (unlike truthy numRecentEvents which short-circuits).
 */
describe("vertex-ai numRecentEvents:0 elif afterTimestamp ninth leftover edges", () => {
	beforeEach(() => {
		vi.spyOn(console, "debug").mockImplementation(() => undefined);
		vi.spyOn(console, "error").mockImplementation(() => undefined);
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

	function mockThreeEvents(asyncRequest: ReturnType<typeof vi.fn>) {
		asyncRequest
			.mockResolvedValueOnce({
				name: "projects/p/locations/l/reasoningEngines/9/sessions/sess-n9",
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
	}

	it("numRecentEvents: 0 is falsy so afterTimestamp elif still filters", async () => {
		const { service, asyncRequest } = createService();
		mockThreeEvents(asyncRequest);

		const session = await service.getSession("app", "u", "sess-n9", {
			numRecentEvents: 0,
			afterTimestamp: Date.parse("2024-01-01T00:00:15.000Z") / 1000,
		});

		expect(session?.events.map((e) => e.content?.parts?.[0]?.text)).toEqual([
			"mid",
			"new",
		]);
	});

	it("truthy numRecentEvents still ignores afterTimestamp (control)", async () => {
		const { service, asyncRequest } = createService();
		mockThreeEvents(asyncRequest);

		const session = await service.getSession("app", "u", "sess-n9", {
			numRecentEvents: 2,
			afterTimestamp: Date.parse("2024-01-01T00:00:15.000Z") / 1000,
		});

		expect(session?.events.map((e) => e.content?.parts?.[0]?.text)).toEqual([
			"mid",
			"new",
		]);
	});

	it("numRecentEvents: 0 alone leaves full history (no afterTimestamp)", async () => {
		const { service, asyncRequest } = createService();
		mockThreeEvents(asyncRequest);

		const session = await service.getSession("app", "u", "sess-n9", {
			numRecentEvents: 0,
		});

		expect(session?.events.map((e) => e.content?.parts?.[0]?.text)).toEqual([
			"old",
			"mid",
			"new",
		]);
	});
});
