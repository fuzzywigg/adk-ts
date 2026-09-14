import { describe, expect, it } from "vitest";
import { VertexAiSessionService } from "../../sessions/vertex-ai-session-service";

/**
 * Fourteenth leftover: getReasoningEngineId regex is case-sensitive on
 * `projects/` / `locations/` / `reasoningEngines/` segments.
 */
describe("vertex-ai resource path case-sensitivity fourteenth leftover", () => {
	const service = new VertexAiSessionService({
		project: "proj",
		location: "us-central1",
	});

	it("lowercase full resource path parses engine id (control)", () => {
		expect(
			(service as any).getReasoningEngineId(
				"projects/proj/locations/us-central1/reasoningEngines/42",
			),
		).toBe("42");
	});

	it.each([
		"Projects/proj/locations/us-central1/reasoningEngines/42",
		"projects/proj/Locations/us-central1/reasoningEngines/42",
		"projects/proj/locations/us-central1/ReasoningEngines/42",
		"PROJECTS/proj/locations/us-central1/reasoningEngines/42",
	])("cased path %j throws (not a valid resource name)", (appName) => {
		expect(() => (service as any).getReasoningEngineId(appName)).toThrow(
			/not valid/,
		);
	});
});
