import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VertexAiSessionService } from "../../sessions/vertex-ai-session-service";

/**
 * Fourteenth leftover: `if (config.numRecentEvents)` is truthiness — string
 * "2" / "0" / NaN behave differently from numeric 0 (ninth leftover).
 */
describe("vertex-ai numRecentEvents truthy coerce fourteenth leftover", () => {
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

	function mockThree(asyncRequest: ReturnType<typeof vi.fn>) {
		asyncRequest
			.mockResolvedValueOnce({
				name: "projects/p/locations/l/reasoningEngines/9/sessions/sess-n",
				updateTime: "2024-01-01T00:00:30.000Z",
				sessionState: {},
			})
			.mockResolvedValueOnce({
				sessionEvents: [
					{
						name: ".../events/e0",
						invocationId: "i0",
						author: "user",
						timestamp: "2024-01-01T00:00:01.000Z",
						content: { parts: [{ text: "old" }] },
					},
					{
						name: ".../events/e1",
						invocationId: "i1",
						author: "agent",
						timestamp: "2024-01-01T00:00:10.000Z",
						content: { parts: [{ text: "mid" }] },
					},
					{
						name: ".../events/e2",
						invocationId: "i2",
						author: "user",
						timestamp: "2024-01-01T00:00:20.000Z",
						content: { parts: [{ text: "new" }] },
					},
				],
			});
	}

	it('numRecentEvents: "2" is truthy and slices via String coercion', async () => {
		const { service, asyncRequest } = createService();
		mockThree(asyncRequest);
		const session = await service.getSession("app", "u", "sess-n", {
			numRecentEvents: "2" as any,
		});
		expect(session?.events.map((e) => e.content?.parts?.[0]?.text)).toEqual([
			"mid",
			"new",
		]);
	});

	it('numRecentEvents: "0" is truthy so afterTimestamp elif is skipped', async () => {
		const { service, asyncRequest } = createService();
		mockThree(asyncRequest);
		const session = await service.getSession("app", "u", "sess-n", {
			numRecentEvents: "0" as any,
			afterTimestamp: Date.parse("2024-01-01T00:00:15.000Z") / 1000,
		});
		// slice(-"0") → slice(-0) → full copy; afterTimestamp never runs
		expect(session?.events.map((e) => e.content?.parts?.[0]?.text)).toEqual([
			"old",
			"mid",
			"new",
		]);
	});

	it("numRecentEvents: NaN is truthy; slice(-NaN) yields full copy", async () => {
		const { service, asyncRequest } = createService();
		mockThree(asyncRequest);
		const session = await service.getSession("app", "u", "sess-n", {
			numRecentEvents: Number.NaN as any,
		});
		expect(session?.events.map((e) => e.content?.parts?.[0]?.text)).toEqual([
			"old",
			"mid",
			"new",
		]);
	});

	it("numeric 0 still falls through to afterTimestamp (control)", async () => {
		const { service, asyncRequest } = createService();
		mockThree(asyncRequest);
		const session = await service.getSession("app", "u", "sess-n", {
			numRecentEvents: 0,
			afterTimestamp: Date.parse("2024-01-01T00:00:15.000Z") / 1000,
		});
		expect(session?.events.map((e) => e.content?.parts?.[0]?.text)).toEqual([
			"mid",
			"new",
		]);
	});
});
