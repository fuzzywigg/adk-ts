import { describe, expect, it } from "vitest";
import { VertexAiSessionService } from "../../sessions/vertex-ai-session-service";

/**
 * Fifteenth leftover: `if (apiEvent.actions)` — falsy actions bag skips custom
 * EventActions ctor and keeps default empty actions.
 */
describe("vertex-ai fromApi actions falsy default fifteenth leftover", () => {
	const service = new VertexAiSessionService({ agentEngineId: "1" });

	it.each([
		0,
		false,
		"",
	] as const)("actions %j yields default empty EventActions", (actions) => {
		const event = (service as any).fromApiEvent({
			name: ".../events/e1",
			author: "agent",
			invocationId: "inv",
			timestamp: "2024-01-01T00:00:00.000Z",
			actions,
		});
		expect(event.actions.stateDelta).toEqual({});
		expect(event.actions.transferToAgent).toBeUndefined();
	});

	it("truthy sparse {} still enters actions branch (control)", () => {
		const event = (service as any).fromApiEvent({
			name: ".../events/e1",
			author: "agent",
			invocationId: "inv",
			timestamp: "2024-01-01T00:00:00.000Z",
			actions: { stateDelta: { k: 1 }, transferAgent: "child" },
		});
		expect(event.actions.stateDelta).toEqual({ k: 1 });
		expect(event.actions.transferToAgent).toBe("child");
	});
});
