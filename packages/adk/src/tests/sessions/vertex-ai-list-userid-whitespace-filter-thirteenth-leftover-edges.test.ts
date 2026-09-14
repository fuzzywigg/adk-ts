import { afterEach, describe, expect, it, vi } from "vitest";
import { VertexAiSessionService } from "../../sessions/vertex-ai-session-service";

/**
 * Thirteenth leftover: listSessions `if (userId)` — empty string skips filter
 * (eighth leftover); whitespace/"0"/false-string are truthy and still filter.
 */
describe("vertex-ai listSessions whitespace userId filter thirteenth leftover", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	function createService() {
		const asyncRequest = vi.fn().mockResolvedValue({ sessions: [] });
		const service = new VertexAiSessionService({ agentEngineId: "9" });
		(service as any).getApiClient = () => ({ async_request: asyncRequest });
		return { service, asyncRequest };
	}

	it.each([
		" ",
		"\t",
		"0",
	])("truthy userId %j still applies filter query", async (userId) => {
		const { service, asyncRequest } = createService();
		await service.listSessions("app", userId);
		expect(asyncRequest.mock.calls[0][0].path).toContain("?filter=user_id=");
		expect(asyncRequest.mock.calls[0][0].path).toContain(
			encodeURIComponent(`"${userId}"`),
		);
	});

	it("empty string still omits filter (control)", async () => {
		const { service, asyncRequest } = createService();
		await service.listSessions("app", "");
		expect(asyncRequest.mock.calls[0][0].path).toBe(
			"reasoningEngines/9/sessions",
		);
	});
});
