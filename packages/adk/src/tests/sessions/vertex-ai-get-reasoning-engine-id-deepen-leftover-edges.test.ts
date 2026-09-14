import { describe, expect, it } from "vitest";
import { VertexAiSessionService } from "../../sessions/vertex-ai-session-service";

/**
 * Leftover deepen: getReasoningEngineId parsing + agentEngineId override edges.
 */
describe("vertex-ai getReasoningEngineId deepen leftover edges", () => {
	it("uses agentEngineId when provided regardless of appName shape", () => {
		const service = new VertexAiSessionService({
			agentEngineId: "engine-override",
			project: "p",
			location: "l",
		});
		expect((service as any).getReasoningEngineId("anything")).toBe(
			"engine-override",
		);
		expect(
			(service as any).getReasoningEngineId(
				"projects/p/locations/l/reasoningEngines/999",
			),
		).toBe("engine-override");
	});

	it("parses full resource name when agentEngineId omitted", () => {
		const service = new VertexAiSessionService({
			project: "proj",
			location: "us-central1",
		});
		expect(
			(service as any).getReasoningEngineId(
				"projects/proj/locations/us-central1/reasoningEngines/42",
			),
		).toBe("42");
	});

	it("treats bare numeric appName as engine id", () => {
		const service = new VertexAiSessionService({
			project: "proj",
			location: "us-central1",
		});
		expect((service as any).getReasoningEngineId("12345")).toBe("12345");
	});

	it("throws when appName is neither resource path nor numeric and no override", () => {
		const service = new VertexAiSessionService({
			project: "proj",
			location: "us-central1",
		});
		expect(() => (service as any).getReasoningEngineId("my-app")).toThrow();
	});

	it("empty constructor still attempts parse from appName", () => {
		const service = new VertexAiSessionService();
		expect(
			(service as any).getReasoningEngineId(
				"projects/x/locations/y/reasoningEngines/7",
			),
		).toBe("7");
	});
});
