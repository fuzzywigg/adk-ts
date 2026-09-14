import { beforeEach, describe, expect, it, vi } from "vitest";
import { LlmAgent } from "../agents/llm-agent";
import { InMemoryArtifactService } from "../artifacts/in-memory-artifact-service";
import { Event } from "../events/event";
import { EventActions } from "../events/event-actions";
import { Runner } from "../runners";
import { InMemorySessionService } from "../sessions/in-memory-session-service";

/**
 * Tenth leftover: rewind artifactDelta filename.startsWith("user:") is
 * case-sensitive. Lowercase skip is covered; USER:/User: are not skipped.
 */
describe("runners rewind artifact user-prefix case tenth leftover edges", () => {
	let runner: Runner;
	const userId = "test_user";
	const sessionId = "test_session";

	beforeEach(() => {
		const rootAgent = new LlmAgent({
			name: "test_agent",
			model: "gemini-2.0-flash-exp",
			description: "",
		});
		runner = new Runner({
			appName: "test_app",
			agent: rootAgent,
			sessionService: new InMemorySessionService(),
			artifactService: new InMemoryArtifactService(),
		});
	});

	it.each([
		{ filename: "USER:profile", label: "USER:" },
		{ filename: "User:profile", label: "User:" },
	])("does NOT skip $label prefixed artifacts in rewind artifactDelta", async ({
		filename,
	}) => {
		const session = await runner.sessionService.createSession(
			runner.appName,
			userId,
			{},
			sessionId,
		);

		await runner.artifactService?.saveArtifact({
			appName: runner.appName,
			userId,
			sessionId,
			filename,
			artifact: { text: "v0" },
		});

		await runner.sessionService.appendEvent(
			session,
			new Event({
				invocationId: "invocation1",
				author: "agent",
				content: { role: "model", parts: [{ text: "one" }] },
				actions: new EventActions({
					artifactDelta: { [filename]: 0 },
				}),
			}),
		);

		await runner.artifactService?.saveArtifact({
			appName: runner.appName,
			userId,
			sessionId,
			filename,
			artifact: { text: "v1" },
		});

		await runner.sessionService.appendEvent(
			session,
			new Event({
				invocationId: "invocation2",
				author: "agent",
				content: { role: "model", parts: [{ text: "two" }] },
				actions: new EventActions({
					artifactDelta: { [filename]: 1 },
				}),
			}),
		);

		const saveSpy = vi.spyOn(runner.artifactService!, "saveArtifact");

		await runner.rewind({
			userId,
			sessionId,
			rewindBeforeInvocationId: "invocation2",
		});

		const rewindDelta =
			(
				await runner.sessionService.getSession(
					runner.appName,
					userId,
					sessionId,
				)
			)?.events.at(-1)?.actions?.artifactDelta ?? {};

		// saveArtifact returns a new version index (not the restored vt)
		expect(Object.keys(rewindDelta)).toContain(filename);
		expect(typeof rewindDelta[filename]).toBe("number");
		expect(saveSpy.mock.calls.some((c) => c[0]?.filename === filename)).toBe(
			true,
		);
	});

	it("still skips exact lowercase user: prefix", async () => {
		const session = await runner.sessionService.createSession(
			runner.appName,
			userId,
			{},
			`${sessionId}-lower`,
		);

		await runner.artifactService?.saveArtifact({
			appName: runner.appName,
			userId,
			sessionId: `${sessionId}-lower`,
			filename: "user:profile",
			artifact: { text: "uv0" },
		});

		await runner.sessionService.appendEvent(
			session,
			new Event({
				invocationId: "invocation1",
				author: "agent",
				content: { role: "model", parts: [{ text: "one" }] },
				actions: new EventActions({
					artifactDelta: { "user:profile": 0 },
				}),
			}),
		);

		await runner.artifactService?.saveArtifact({
			appName: runner.appName,
			userId,
			sessionId: `${sessionId}-lower`,
			filename: "user:profile",
			artifact: { text: "uv1" },
		});

		await runner.sessionService.appendEvent(
			session,
			new Event({
				invocationId: "invocation2",
				author: "agent",
				content: { role: "model", parts: [{ text: "two" }] },
				actions: new EventActions({
					artifactDelta: { "user:profile": 1 },
				}),
			}),
		);

		await runner.rewind({
			userId,
			sessionId: `${sessionId}-lower`,
			rewindBeforeInvocationId: "invocation2",
		});

		const rewindDelta =
			(
				await runner.sessionService.getSession(
					runner.appName,
					userId,
					`${sessionId}-lower`,
				)
			)?.events.at(-1)?.actions?.artifactDelta ?? {};

		expect(Object.keys(rewindDelta)).not.toContain("user:profile");
	});
});
