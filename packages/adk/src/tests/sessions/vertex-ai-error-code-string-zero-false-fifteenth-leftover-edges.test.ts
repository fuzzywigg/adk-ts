import { describe, expect, it } from "vitest";
import { VertexAiSessionService } from "../../sessions/vertex-ai-session-service";

/**
 * Fifteenth leftover: fromApiEvent `if (apiEvent.errorCode)` /
 * `if (apiEvent.errorMessage)` — fourteenth pins falsy 0/""/false skip.
 * String `"0"` / `"false"` are truthy and assigned.
 */
describe("vertex-ai errorCode string-zero-false truthy fifteenth leftover", () => {
	const service = new VertexAiSessionService({ agentEngineId: "9" });
	const fromApi = (apiEvent: Record<string, any>) =>
		(service as any).fromApiEvent(apiEvent);

	it.each([
		"0",
		"false",
	])('errorCode "%s" is assigned (truthy string)', (errorCode) => {
		const event = fromApi({
			name: ".../events/e1",
			invocationId: "i",
			author: "agent",
			timestamp: "2024-01-01T00:00:00.000Z",
			errorCode,
			errorMessage: "kept",
		});
		expect(event.errorCode).toBe(errorCode);
		expect(event.errorMessage).toBe("kept");
	});

	it.each([
		"0",
		"false",
	])('errorMessage "%s" is assigned (truthy string)', (errorMessage) => {
		const event = fromApi({
			name: ".../events/e1",
			invocationId: "i",
			author: "agent",
			timestamp: "2024-01-01T00:00:00.000Z",
			errorCode: "E",
			errorMessage,
		});
		expect(event.errorCode).toBe("E");
		expect(event.errorMessage).toBe(errorMessage);
	});

	it("numeric 0 still skips (fourteenth control)", () => {
		const event = fromApi({
			name: ".../events/e1",
			invocationId: "i",
			author: "agent",
			timestamp: "2024-01-01T00:00:00.000Z",
			errorCode: 0,
			errorMessage: 0,
		});
		expect(event.errorCode).toBeUndefined();
		expect(event.errorMessage).toBeUndefined();
	});
});
