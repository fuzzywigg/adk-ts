import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VertexAiSessionService } from "../../sessions/vertex-ai-session-service";

/**
 * Fifteenth leftover: `if (sessionEvents)` — empty [] is truthy so push runs
 * (no-op); null/0/false skip the branch entirely.
 */
describe("vertex-ai sessionEvents empty-array truthy fifteenth leftover", () => {
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

	it("sessionEvents: [] still enters map branch (empty result)", async () => {
		const { service, asyncRequest } = createService();
		asyncRequest
			.mockResolvedValueOnce({
				name: "projects/p/locations/l/reasoningEngines/9/sessions/sess-e",
				updateTime: "2024-01-01T00:00:30.000Z",
				sessionState: { ok: 1 },
			})
			.mockResolvedValueOnce({ sessionEvents: [] });

		const session = await service.getSession("app", "u", "sess-e");
		expect(session?.state).toEqual({ ok: 1 });
		expect(session?.events).toEqual([]);
	});

	it.each([
		null,
		0,
		false,
	] as const)("sessionEvents %j skips map branch (still empty events)", async (sessionEvents) => {
		const { service, asyncRequest } = createService();
		asyncRequest
			.mockResolvedValueOnce({
				name: "projects/p/locations/l/reasoningEngines/9/sessions/sess-f",
				updateTime: "2024-01-01T00:00:30.000Z",
				sessionState: {},
			})
			.mockResolvedValueOnce({ sessionEvents });

		const session = await service.getSession("app", "u", "sess-f");
		expect(session?.events).toEqual([]);
	});
});
