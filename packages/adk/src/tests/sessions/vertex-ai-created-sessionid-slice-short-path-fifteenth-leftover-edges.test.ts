import { afterEach, describe, expect, it, vi } from "vitest";
import { VertexAiSessionService } from "../../sessions/vertex-ai-session-service";

/**
 * Fifteenth leftover: `apiResponse.name.split("/").slice(-3, -2)[0]` —
 * short/malformed operation names yield undefined → String → `"undefined"`.
 */
describe("vertex-ai created sessionId slice short-path fifteenth leftover", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	function createService() {
		const asyncRequest = vi.fn();
		const service = new VertexAiSessionService({ agentEngineId: "9" });
		(service as any).getApiClient = () => ({ async_request: asyncRequest });
		return { service, asyncRequest };
	}

	it('short name with <3 segments yields id "undefined"', async () => {
		vi.spyOn(console, "debug").mockImplementation(() => undefined);
		const { service, asyncRequest } = createService();
		asyncRequest
			.mockResolvedValueOnce({ name: "operations/op1" })
			.mockResolvedValueOnce({ done: true })
			.mockResolvedValueOnce({
				name: "projects/p/locations/l/reasoningEngines/9/sessions/s1",
				updateTime: "2024-01-01T00:00:00.000Z",
				sessionState: {},
			});
		const session = await service.createSession("app", "u");
		expect(session.id).toBe("undefined");
	});

	it("two-segment name still yields undefined session id slice", async () => {
		vi.spyOn(console, "debug").mockImplementation(() => undefined);
		const { service, asyncRequest } = createService();
		asyncRequest
			.mockResolvedValueOnce({ name: "sessions/only" })
			.mockResolvedValueOnce({ done: true })
			.mockResolvedValueOnce({
				name: "projects/p/locations/l/reasoningEngines/9/sessions/s1",
				updateTime: "2024-01-01T00:00:00.000Z",
				sessionState: {},
			});
		const session = await service.createSession("app", "u");
		expect(session.id).toBe("undefined");
	});

	it("full resource path still extracts s1 (control)", async () => {
		vi.spyOn(console, "debug").mockImplementation(() => undefined);
		const { service, asyncRequest } = createService();
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
		await expect(service.createSession("app", "u")).resolves.toMatchObject({
			id: "s1",
		});
	});
});
