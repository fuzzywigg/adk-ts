import { describe, expect, it } from "vitest";
import { VertexAiSessionService } from "../../sessions/vertex-ai-session-service";

/**
 * Fifteenth leftover: longRunningToolIdsList ? new Set(...) : undefined —
 * string "0" → Set(["0"]); falsy 0/""/false → undefined.
 */
describe("vertex-ai fromApi longRunning string-zero set fifteenth leftover", () => {
	const service = new VertexAiSessionService({ agentEngineId: "1" });

	it('longRunningToolIds: "0" becomes Set(["0"])', () => {
		const event = (service as any).fromApiEvent({
			name: ".../events/e1",
			author: "agent",
			invocationId: "inv",
			timestamp: "2024-01-01T00:00:00.000Z",
			eventMetadata: { longRunningToolIds: "0" },
		});
		expect(event.longRunningToolIds).toEqual(new Set(["0"]));
	});

	it.each([
		0,
		"",
		false,
	] as const)("longRunningToolIds %j is falsy → undefined", (longRunningToolIds) => {
		const event = (service as any).fromApiEvent({
			name: ".../events/e1",
			author: "agent",
			invocationId: "inv",
			timestamp: "2024-01-01T00:00:00.000Z",
			eventMetadata: { longRunningToolIds },
		});
		expect(event.longRunningToolIds).toBeUndefined();
	});

	it("array list still becomes Set (control)", () => {
		const event = (service as any).fromApiEvent({
			name: ".../events/e1",
			author: "agent",
			invocationId: "inv",
			timestamp: "2024-01-01T00:00:00.000Z",
			eventMetadata: { longRunningToolIds: ["a", "b"] },
		});
		expect(event.longRunningToolIds).toEqual(new Set(["a", "b"]));
	});
});
