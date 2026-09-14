import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VertexAiSessionService } from "../../sessions/vertex-ai-session-service";

/**
 * Fifteenth leftover: `if (httpHeaders)` — falsy 0/""/false do NOT early-return,
 * so sessionEvents still map. Opposite of fourteenth truthy win.
 */
describe("vertex-ai httpHeaders falsy still maps events fifteenth leftover", () => {
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

	it.each([
		0,
		"",
		false,
	] as const)("httpHeaders %j is falsy so sessionEvents still map", async (httpHeaders) => {
		const { service, asyncRequest } = createService();
		asyncRequest
			.mockResolvedValueOnce({
				name: "projects/p/locations/l/reasoningEngines/9/sessions/sess-f",
				updateTime: "2024-01-01T00:00:30.000Z",
				sessionState: {},
			})
			.mockResolvedValueOnce({
				httpHeaders,
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

		const session = await service.getSession("app", "u", "sess-f");
		expect(session?.events.map((e) => e.content?.parts?.[0]?.text)).toEqual([
			"kept",
		]);
	});

	it("empty {} httpHeaders is truthy and still drops events (control)", async () => {
		const { service, asyncRequest } = createService();
		asyncRequest
			.mockResolvedValueOnce({
				name: "projects/p/locations/l/reasoningEngines/9/sessions/sess-c",
				updateTime: "2024-01-01T00:00:30.000Z",
				sessionState: {},
			})
			.mockResolvedValueOnce({
				httpHeaders: {},
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
		const session = await service.getSession("app", "u", "sess-c");
		expect(session?.events).toEqual([]);
	});
});
