import { describe, expect, it } from "vitest";
import * as agents from "../../agents";

describe("agents barrel exports", () => {
	it("exposes builder and core agent classes", () => {
		expect(typeof agents.AgentBuilder).toBe("function");
		expect(typeof agents.AgentBuilder.create).toBe("function");
		expect(typeof agents.BaseAgent).toBe("function");
		expect(typeof agents.LlmAgent).toBe("function");
		expect(typeof agents.LoopAgent).toBe("function");
		expect(typeof agents.ParallelAgent).toBe("function");
		expect(typeof agents.SequentialAgent).toBe("function");
		expect(typeof agents.LangGraphAgent).toBe("function");
	});

	it("exposes context and run-config helpers", () => {
		expect(typeof agents.CallbackContext).toBe("function");
		expect(typeof agents.InvocationContext).toBe("function");
		expect(typeof agents.ReadonlyContext).toBe("function");
		expect(typeof agents.RunConfig).toBe("function");
		expect(agents.StreamingMode.NONE).toBe("NONE");
		expect(agents.StreamingMode.SSE).toBe("sse");
		expect(agents.StreamingMode.BIDI).toBe("bidi");
		expect(typeof agents.newInvocationContextId).toBe("function");
		expect(agents.newInvocationContextId()).toMatch(/^e-/);
	});

	it("does not re-export live/streaming helpers (index surface pin)", () => {
		expect(agents).not.toHaveProperty("ActiveStreamingTool");
		expect(agents).not.toHaveProperty("LiveRequest");
		expect(agents).not.toHaveProperty("LiveRequestQueue");
		expect(agents).not.toHaveProperty("TranscriptionEntry");
	});
});
