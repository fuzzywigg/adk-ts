import { afterEach, describe, expect, it, vi } from "vitest";
import { VertexAiSessionService } from "../../sessions/vertex-ai-session-service";

/**
 * Thirteenth leftover: LRO wait uses `if (lroResponse?.done)` truthiness, then
 * `if (!lroResponse || !lroResponse.done)` timeout. done: 0/"" never breaks.
 */
describe("vertex-ai LRO done falsy keep-polling thirteenth leftover edges", () => {
	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	function createService() {
		const asyncRequest = vi.fn();
		const service = new VertexAiSessionService({ agentEngineId: "9" });
		(service as any).getApiClient = () => ({ async_request: asyncRequest });
		return { service, asyncRequest };
	}

	it.each([
		{ label: "0", done: 0 },
		{ label: "empty string", done: "" },
		{ label: "false", done: false },
	])("done=$label never completes the LRO wait", async ({ done }) => {
		vi.useFakeTimers();
		vi.spyOn(console, "debug").mockImplementation(() => undefined);
		const { service, asyncRequest } = createService();
		asyncRequest.mockResolvedValueOnce({
			name: "projects/p/locations/l/reasoningEngines/9/sessions/s1/operations/op1",
		});
		asyncRequest.mockResolvedValue({ done });

		const pending = service.createSession("app", "u");
		await vi.runAllTimersAsync();
		await expect(pending).rejects.toThrow(/Timeout waiting for operation/);
	});

	it("done: true still completes (control)", async () => {
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
