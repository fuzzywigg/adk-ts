import { afterEach, describe, expect, it, vi } from "vitest";
import { VertexAiSessionService } from "../../sessions/vertex-ai-session-service";

/**
 * Thirteenth leftover: `if (sessionId)` — eighth leftover covered "" vs
 * whitespace; 0/false/null are also falsy and skip the user-id throw.
 */
describe("vertex-ai sessionId 0/false/null thirteenth leftover edges", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

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

	it.each([
		{ label: "0", sessionId: 0 },
		{ label: "false", sessionId: false },
		{ label: "null", sessionId: null },
	])("allows falsy sessionId $label (no user-provided-id throw)", async ({
		sessionId,
	}) => {
		vi.spyOn(console, "debug").mockImplementation(() => undefined);
		const { service, asyncRequest } = createService();
		mockCreateSuccess(asyncRequest);
		await expect(
			service.createSession("app", "user", undefined, sessionId as any),
		).resolves.toMatchObject({ id: "s1" });
		expect(asyncRequest).toHaveBeenCalled();
	});

	it('still throws on truthy "0" string (control vs numeric 0)', async () => {
		const { service, asyncRequest } = createService();
		await expect(
			service.createSession("app", "user", undefined, "0"),
		).rejects.toThrow(/User-provided Session id is not supported/);
		expect(asyncRequest).not.toHaveBeenCalled();
	});
});
