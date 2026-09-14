import { describe, expect, it } from "vitest";
import { VertexAiSessionService } from "../../sessions/vertex-ai-session-service";

/**
 * Fourteenth leftover: fromApiEvent uses truthy `if (apiEvent.errorCode)` /
 * `if (apiEvent.errorMessage)` — falsy values leave properties unset.
 */
describe("vertex-ai errorCode falsy skip fourteenth leftover", () => {
	const service = new VertexAiSessionService({ agentEngineId: "9" });
	const fromApi = (apiEvent: Record<string, any>) =>
		(service as any).fromApiEvent(apiEvent);

	it.each([
		{ label: "0", errorCode: 0 },
		{ label: "empty string", errorCode: "" },
		{ label: "false", errorCode: false },
		{ label: "null", errorCode: null },
	])("falsy errorCode ($label) leaves errorCode unset", ({ errorCode }) => {
		const event = fromApi({
			name: ".../events/e1",
			invocationId: "i",
			author: "agent",
			timestamp: "2024-01-01T00:00:00.000Z",
			errorCode,
			errorMessage: "kept",
		});
		expect(event.errorCode).toBeUndefined();
		expect(event.errorMessage).toBe("kept");
	});

	it.each([
		{ label: "0", errorMessage: 0 },
		{ label: "empty string", errorMessage: "" },
		{ label: "false", errorMessage: false },
	])("falsy errorMessage ($label) leaves errorMessage unset", ({
		errorMessage,
	}) => {
		const event = fromApi({
			name: ".../events/e1",
			invocationId: "i",
			author: "agent",
			timestamp: "2024-01-01T00:00:00.000Z",
			errorCode: "E",
			errorMessage,
		});
		expect(event.errorCode).toBe("E");
		expect(event.errorMessage).toBeUndefined();
	});

	it("truthy error fields are kept (control)", () => {
		const event = fromApi({
			name: ".../events/e1",
			invocationId: "i",
			author: "agent",
			timestamp: "2024-01-01T00:00:00.000Z",
			errorCode: "E",
			errorMessage: "boom",
		});
		expect(event.errorCode).toBe("E");
		expect(event.errorMessage).toBe("boom");
	});
});
