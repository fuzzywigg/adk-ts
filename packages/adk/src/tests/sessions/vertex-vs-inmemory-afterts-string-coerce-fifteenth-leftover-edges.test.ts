import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Event } from "../../events/event";
import { InMemorySessionService } from "../../sessions/in-memory-session-service";
import { VertexAiSessionService } from "../../sessions/vertex-ai-session-service";

/**
 * Fifteenth leftover: afterTimestamp comparison coerces string thresholds
 * (`timestamp < "20"`). Slice asymmetry from fourteenth still holds under
 * string coercion.
 */
describe("vertex vs in-memory afterTs string coerce fifteenth leftover", () => {
	beforeEach(() => {
		vi.spyOn(console, "error").mockImplementation(() => undefined);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('afterTimestamp: "20" on [10,20,30] — same slice asymmetry as numeric', async () => {
		const memory = new InMemorySessionService();
		const session = await memory.createSession("app", "u", {}, "s");
		for (const [i, ts] of [10, 20, 30].entries()) {
			await memory.appendEvent(
				session,
				new Event({
					author: "agent",
					invocationId: `inv-${i}`,
					timestamp: ts,
					content: { role: "model", parts: [{ text: `e${ts}` }] },
				}),
			);
		}

		const memFiltered = await memory.getSession("app", "u", "s", {
			afterTimestamp: "20" as any,
		});
		expect(memFiltered?.events.map((e) => e.timestamp)).toEqual([20, 30]);

		const asyncRequest = vi.fn();
		const vertex = new VertexAiSessionService({ agentEngineId: "9" });
		(vertex as any).getApiClient = () => ({ async_request: asyncRequest });
		asyncRequest
			.mockResolvedValueOnce({
				name: "projects/p/locations/l/reasoningEngines/9/sessions/s",
				updateTime: "2024-01-01T00:01:00.000Z",
				sessionState: {},
			})
			.mockResolvedValueOnce({
				sessionEvents: [
					{
						name: ".../events/e10",
						invocationId: "i0",
						author: "agent",
						timestamp: "1970-01-01T00:00:10.000Z",
						content: { parts: [{ text: "e10" }] },
					},
					{
						name: ".../events/e20",
						invocationId: "i1",
						author: "agent",
						timestamp: "1970-01-01T00:00:20.000Z",
						content: { parts: [{ text: "e20" }] },
					},
					{
						name: ".../events/e30",
						invocationId: "i2",
						author: "agent",
						timestamp: "1970-01-01T00:00:30.000Z",
						content: { parts: [{ text: "e30" }] },
					},
				],
			});

		const vertexFiltered = await vertex.getSession("app", "u", "s", {
			afterTimestamp: "20" as any,
		});
		expect(vertexFiltered?.events.map((e) => e.timestamp)).toEqual([
			10, 20, 30,
		]);
	});
});
