import { afterEach, describe, expect, it, vi } from "vitest";
import { VertexAiSessionService } from "../../sessions/vertex-ai-session-service";

/**
 * Fourteenth leftover: LRO `if (lroResponse?.done)` — string "false" / "0" /
 * "true" are all truthy so they stop polling (unlike boolean false / 0).
 */
describe("vertex-ai LRO done string-truthy fourteenth leftover edges", () => {
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
		"false",
		"0",
		"true",
		" ",
	] as const)("done: %j is truthy and completes the LRO wait", async (done) => {
		vi.spyOn(console, "debug").mockImplementation(() => undefined);
		const { service, asyncRequest } = createService();
		asyncRequest
			.mockResolvedValueOnce({
				name: "projects/p/locations/l/reasoningEngines/9/sessions/s1/operations/op1",
			})
			.mockResolvedValueOnce({ done })
			.mockResolvedValueOnce({
				name: "projects/p/locations/l/reasoningEngines/9/sessions/s1",
				updateTime: "2024-01-01T00:00:00.000Z",
				sessionState: {},
			});
		await expect(service.createSession("app", "u")).resolves.toMatchObject({
			id: "s1",
		});
	});

	it("done: false still keeps polling (control)", async () => {
		vi.spyOn(console, "debug").mockImplementation(() => undefined);
		vi.spyOn(globalThis, "setTimeout").mockImplementation((fn) => {
			(fn as () => void)();
			return 0 as unknown as NodeJS.Timeout;
		});
		const { service, asyncRequest } = createService();
		asyncRequest.mockResolvedValueOnce({
			name: "projects/p/locations/l/reasoningEngines/9/sessions/s1/operations/op1",
		});
		asyncRequest.mockResolvedValue({ done: false });
		await expect(service.createSession("app", "u")).rejects.toThrow(
			/Timeout waiting for operation/,
		);
	});
});
