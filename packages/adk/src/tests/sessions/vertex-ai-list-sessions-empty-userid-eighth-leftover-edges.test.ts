import { afterEach, describe, expect, it, vi } from "vitest";
import { VertexAiSessionService } from "../../sessions/vertex-ai-session-service";

/**
 * Leftover: listSessions `if (userId)` skips filter for empty string —
 * lists all sessions without ?filter=.
 */
describe("vertex-ai list-sessions empty-userid eighth leftover edges", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	function createService() {
		const asyncRequest = vi.fn().mockResolvedValue({ sessions: [] });
		const service = new VertexAiSessionService({ agentEngineId: "9" });
		(service as any).getApiClient = () => ({ async_request: asyncRequest });
		return { service, asyncRequest };
	}

	it("empty userId omits filter query", async () => {
		const { service, asyncRequest } = createService();
		await service.listSessions("app", "");
		expect(asyncRequest).toHaveBeenCalledWith({
			http_method: "GET",
			path: "reasoningEngines/9/sessions",
			request_dict: {},
		});
	});

	it("non-empty userId still applies filter (control)", async () => {
		const { service, asyncRequest } = createService();
		await service.listSessions("app", "alice");
		expect(asyncRequest.mock.calls[0][0].path).toContain("?filter=user_id=");
		expect(asyncRequest.mock.calls[0][0].path).toContain(
			encodeURIComponent('"alice"'),
		);
	});
});
