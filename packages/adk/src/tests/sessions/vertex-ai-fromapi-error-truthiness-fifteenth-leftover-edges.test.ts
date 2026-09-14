import { describe, expect, it } from "vitest";
import { VertexAiSessionService } from "../../sessions/vertex-ai-session-service";

/**
 * Fifteenth leftover: fromApiEvent gates errorCode/errorMessage with truthiness.
 * "" / 0 / false skipped; "0" / "false" kept.
 */
describe("vertex-ai fromApi error truthiness fifteenth leftover", () => {
	const service = new VertexAiSessionService({ agentEngineId: "1" });

	it.each([
		{
			errorCode: "",
			errorMessage: "",
			expectCode: undefined,
			expectMsg: undefined,
		},
		{
			errorCode: 0,
			errorMessage: 0,
			expectCode: undefined,
			expectMsg: undefined,
		},
		{
			errorCode: false,
			errorMessage: false,
			expectCode: undefined,
			expectMsg: undefined,
		},
		{ errorCode: "0", errorMessage: "0", expectCode: "0", expectMsg: "0" },
		{
			errorCode: "false",
			errorMessage: "false",
			expectCode: "false",
			expectMsg: "false",
		},
	] as const)("errorCode/Message $errorCode / $errorMessage → $expectCode / $expectMsg", ({
		errorCode,
		errorMessage,
		expectCode,
		expectMsg,
	}) => {
		const event = (service as any).fromApiEvent({
			name: ".../events/e1",
			author: "agent",
			invocationId: "inv",
			timestamp: "2024-01-01T00:00:00.000Z",
			errorCode,
			errorMessage,
		});
		expect(event.errorCode).toBe(expectCode);
		expect(event.errorMessage).toBe(expectMsg);
	});
});
