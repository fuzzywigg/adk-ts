import { beforeEach, describe, expect, it, vi } from "vitest";
import { LlmAgent } from "../agents/llm-agent";
import { Event } from "../events/event";
import { EventActions } from "../events/event-actions";
import { Runner } from "../runners";
import { InMemorySessionService } from "../sessions/in-memory-session-service";

describe("Runner sixth leftover: rewind saveArtifact reject (post #151)", () => {
	let sessionService: InMemorySessionService;
	let agent: LlmAgent;

	beforeEach(() => {
		sessionService = new InMemorySessionService();
		agent = new LlmAgent({
			name: "root_agent",
			model: "gemini-2.0-flash-exp",
		});
	});

	it("rewind propagates when saveArtifact rejects mid-delta", async () => {
		const session = await sessionService.createSession(
			"runner-rewind-reject-app",
			"u1",
			{},
			"s-reject",
		);

		await sessionService.appendEvent(
			session,
			new Event({
				invocationId: "inv1",
				author: "root_agent",
				content: { role: "model", parts: [{ text: "v1" }] },
				actions: new EventActions({
					artifactDelta: { "note.txt": 0 },
				}),
			}),
		);
		await sessionService.appendEvent(
			session,
			new Event({
				invocationId: "inv2",
				author: "root_agent",
				content: { role: "model", parts: [{ text: "v2" }] },
				actions: new EventActions({
					artifactDelta: { "note.txt": 1 },
				}),
			}),
		);

		const saveArtifact = vi
			.fn()
			.mockRejectedValue(new Error("artifact store down"));
		const runner = new Runner({
			appName: "runner-rewind-reject-app",
			agent,
			sessionService,
			artifactService: { saveArtifact } as any,
		});

		await expect(
			runner.rewind({
				userId: "u1",
				sessionId: "s-reject",
				rewindBeforeInvocationId: "inv2",
			}),
		).rejects.toThrow("artifact store down");

		expect(saveArtifact).toHaveBeenCalledTimes(1);
		const refreshed = await sessionService.getSession(
			"runner-rewind-reject-app",
			"u1",
			"s-reject",
		);
		expect(
			refreshed?.events.some(
				(e) => e.actions?.rewindBeforeInvocationId === "inv2",
			),
		).toBe(false);
	});

	it("_computeArtifactDeltaForRewind rejects without writing delta when save fails", async () => {
		const session = await sessionService.createSession(
			"runner-rewind-reject-app",
			"u1",
			{},
			"s-direct",
		);
		await sessionService.appendEvent(
			session,
			new Event({
				invocationId: "inv-a",
				author: "root_agent",
				actions: new EventActions({
					artifactDelta: { "a.bin": 0 },
				}),
			}),
		);
		await sessionService.appendEvent(
			session,
			new Event({
				invocationId: "inv-b",
				author: "root_agent",
				actions: new EventActions({
					artifactDelta: { "a.bin": 2, "b.bin": 0 },
				}),
			}),
		);

		const saveArtifact = vi
			.fn()
			.mockRejectedValueOnce(new Error("first save failed"));
		const runner = new Runner({
			appName: "runner-rewind-reject-app",
			agent,
			sessionService,
			artifactService: { saveArtifact } as any,
		});

		await expect(
			(runner as any)._computeArtifactDeltaForRewind(session, 1),
		).rejects.toThrow("first save failed");
	});
});
