import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VertexAiSessionService } from "../../sessions/vertex-ai-session-service";

/**
 * Fourteenth leftover: getSession/createSession map API sessionState via
 * `sessionState || {}` — falsy collapses; truthy non-objects (e.g. []) keep.
 */
describe("vertex-ai sessionState || {} fourteenth leftover edges", () => {
	beforeEach(() => {
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

	it.each([
		{ label: "null", sessionState: null },
		{ label: "0", sessionState: 0 },
		{ label: "false", sessionState: false },
		{ label: "empty string", sessionState: "" },
	])("getSession falsy sessionState ($label) coalesces to {}", async ({
		sessionState,
	}) => {
		const { service, asyncRequest } = createService();
		asyncRequest
			.mockResolvedValueOnce({
				name: "projects/p/locations/l/reasoningEngines/9/sessions/s",
				updateTime: "2024-01-01T00:00:00.000Z",
				sessionState,
			})
			.mockResolvedValueOnce({ httpHeaders: {} });

		const session = await service.getSession("app", "u", "s");
		expect(session?.state).toEqual({});
	});

	it("empty array sessionState is truthy and kept", async () => {
		const { service, asyncRequest } = createService();
		asyncRequest
			.mockResolvedValueOnce({
				name: "projects/p/locations/l/reasoningEngines/9/sessions/s",
				updateTime: "2024-01-01T00:00:00.000Z",
				sessionState: [],
			})
			.mockResolvedValueOnce({ httpHeaders: {} });

		const session = await service.getSession("app", "u", "s");
		expect(Array.isArray(session?.state)).toBe(true);
		expect(session?.state).toEqual([]);
	});

	it("populated sessionState is preserved (control)", async () => {
		const { service, asyncRequest } = createService();
		asyncRequest
			.mockResolvedValueOnce({
				name: "projects/p/locations/l/reasoningEngines/9/sessions/s",
				updateTime: "2024-01-01T00:00:00.000Z",
				sessionState: { k: 0 },
			})
			.mockResolvedValueOnce({ httpHeaders: {} });

		const session = await service.getSession("app", "u", "s");
		expect(session?.state).toEqual({ k: 0 });
	});
});
