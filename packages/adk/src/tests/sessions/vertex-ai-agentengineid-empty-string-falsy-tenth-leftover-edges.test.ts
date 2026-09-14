import { describe, expect, it } from "vitest";
import { VertexAiSessionService } from "../../sessions/vertex-ai-session-service";

/**
 * Tenth leftover: getReasoningEngineId uses truthy `if (this.agentEngineId)` —
 * empty string / 0 fall through to appName parse; string "0" is kept.
 */
describe("vertex-ai agentEngineId empty-string falsy tenth leftover edges", () => {
	const resource = "projects/p/locations/l/reasoningEngines/42";

	it('agentEngineId: "" is falsy and parses the resource appName', () => {
		const service = new VertexAiSessionService({
			agentEngineId: "",
			project: "p",
			location: "l",
		});
		expect((service as any).getReasoningEngineId(resource)).toBe("42");
	});

	it("agentEngineId: 0 is falsy and falls through to numeric appName", () => {
		const service = new VertexAiSessionService({
			agentEngineId: 0 as any,
			project: "p",
			location: "l",
		});
		expect((service as any).getReasoningEngineId("99")).toBe("99");
	});

	it('agentEngineId: "0" is truthy and wins over appName (control vs empty)', () => {
		const service = new VertexAiSessionService({
			agentEngineId: "0",
			project: "p",
			location: "l",
		});
		expect((service as any).getReasoningEngineId(resource)).toBe("0");
		expect((service as any).getReasoningEngineId("99")).toBe("0");
	});

	it("omitted agentEngineId still parses (control)", () => {
		const service = new VertexAiSessionService({
			project: "p",
			location: "l",
		});
		expect((service as any).getReasoningEngineId(resource)).toBe("42");
	});

	it("whitespace agentEngineId is truthy and does not parse appName", () => {
		const service = new VertexAiSessionService({
			agentEngineId: "   ",
			project: "p",
			location: "l",
		});
		expect((service as any).getReasoningEngineId(resource)).toBe("   ");
	});
});
