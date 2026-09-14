import { afterEach, describe, expect, it, vi } from "vitest";
import { VertexAiSessionService } from "../../sessions/vertex-ai-session-service";

/**
 * Leftover: Vertex createSession uses truthy `if (sessionId)` — empty string
 * is allowed, but whitespace-only ids throw (unlike DB/in-memory trim||uuid).
 */
describe("vertex-ai sessionId falsy-vs-whitespace eighth leftover edges", () => {
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
		"  ",
		"id",
		"\t",
	] as const)("throws on truthy sessionId %j", async (sessionId) => {
		const { service, asyncRequest } = createService();
		await expect(
			service.createSession("app", "user", undefined, sessionId),
		).rejects.toThrow(/User-provided Session id is not supported/);
		expect(asyncRequest).not.toHaveBeenCalled();
	});

	it("allows empty-string sessionId (falsy gate)", async () => {
		vi.spyOn(console, "debug").mockImplementation(() => undefined);
		const { service, asyncRequest } = createService();
		mockCreateSuccess(asyncRequest);
		await expect(
			service.createSession("app", "user", undefined, ""),
		).resolves.toMatchObject({ id: "s1" });
		expect(asyncRequest).toHaveBeenCalled();
	});

	it("allows omitted sessionId (control)", async () => {
		vi.spyOn(console, "debug").mockImplementation(() => undefined);
		const { service, asyncRequest } = createService();
		mockCreateSuccess(asyncRequest);
		await expect(service.createSession("app", "user")).resolves.toMatchObject({
			id: "s1",
		});
		expect(asyncRequest).toHaveBeenCalled();
	});
});
