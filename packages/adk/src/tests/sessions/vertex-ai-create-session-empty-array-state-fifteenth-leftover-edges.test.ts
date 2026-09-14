import { afterEach, describe, expect, it, vi } from "vitest";
import { VertexAiSessionService } from "../../sessions/vertex-ai-session-service";

function createService() {
	const asyncRequest = vi.fn();
	const service = new VertexAiSessionService({ agentEngineId: "9" });
	(service as any).getApiClient = () => ({ async_request: asyncRequest });
	return { service, asyncRequest };
}

function mockCreateSuccess(asyncRequest: ReturnType<typeof vi.fn>) {
	asyncRequest
		.mockResolvedValueOnce({
			name: "projects/p/locations/l/reasoningEngines/9/sessions/s1/operations/op1",
		})
		.mockResolvedValueOnce({ done: true })
		.mockResolvedValueOnce({
			name: "projects/p/locations/l/reasoningEngines/9/sessions/s1",
			updateTime: "2024-01-01T00:00:00.000Z",
			sessionState: {},
		});
}

/**
 * Fifteenth leftover: createSession `if (state)` — empty array is truthy so
 * session_state: [] is sent. Falsy leftover covered 0/null/false/"" only.
 */
describe("vertex-ai createSession empty-array state fifteenth leftover", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("includes session_state for empty array []", async () => {
		vi.spyOn(console, "debug").mockImplementation(() => undefined);
		const { service, asyncRequest } = createService();
		mockCreateSuccess(asyncRequest);
		await service.createSession("app", "u", [] as any);
		expect(asyncRequest.mock.calls[0][0].request_dict).toEqual({
			user_id: "u",
			session_state: [],
		});
	});

	it("still omits session_state for numeric 0 (control)", async () => {
		vi.spyOn(console, "debug").mockImplementation(() => undefined);
		const { service, asyncRequest } = createService();
		mockCreateSuccess(asyncRequest);
		await service.createSession("app", "u", 0 as any);
		expect(asyncRequest.mock.calls[0][0].request_dict).toEqual({
			user_id: "u",
		});
		expect(asyncRequest.mock.calls[0][0].request_dict).not.toHaveProperty(
			"session_state",
		);
	});
});
