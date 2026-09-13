import { describe, expect, it } from "vitest";
import { LlmAgent } from "../agents/llm-agent";
import { InMemoryArtifactService } from "../artifacts/in-memory-artifact-service";
import { InMemoryMemoryService } from "../memory/in-memory-memory-service";
import { InMemoryRunner } from "../runners";
import { InMemorySessionService } from "../sessions/in-memory-session-service";

describe("InMemoryRunner", () => {
	it("constructs with in-memory session, artifact, and memory services", () => {
		const agent = new LlmAgent({
			name: "stub_agent",
			description: "stub",
		});

		const runner = new InMemoryRunner(agent, { appName: "test-app" });

		expect(runner.agent).toBe(agent);
		expect(runner.appName).toBe("test-app");
		expect(runner.sessionService).toBeInstanceOf(InMemorySessionService);
		expect(runner.artifactService).toBeInstanceOf(InMemoryArtifactService);
		expect(runner.memoryService).toBeInstanceOf(InMemoryMemoryService);
	});

	it("defaults appName to InMemoryRunner", () => {
		const agent = new LlmAgent({ name: "default_app_agent" });
		const runner = new InMemoryRunner(agent);
		expect(runner.appName).toBe("InMemoryRunner");
	});
});
