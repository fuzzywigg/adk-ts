import { beforeEach, describe, expect, it, vi } from "vitest";
import { LlmAgent } from "../agents/llm-agent";
import { getArtifactUri } from "../artifacts/artifact-util";
import { InMemoryArtifactService } from "../artifacts/in-memory-artifact-service";
import { Event } from "../events/event";
import { EventActions } from "../events/event-actions";
import { Runner } from "../runners";
import { InMemorySessionService } from "../sessions/in-memory-session-service";

describe("Runner.rewind", () => {
	let runner: Runner;
	const userId = "test_user";
	const sessionId = "test_session";

	beforeEach(() => {
		const rootAgent = new LlmAgent({
			name: "test_agent",
			model: "gemini-2.0-flash-exp",
			description: "",
		});
		const sessionService = new InMemorySessionService();
		const artifactService = new InMemoryArtifactService();
		runner = new Runner({
			appName: "test_app",
			agent: rootAgent,
			sessionService,
			artifactService,
		});
	});

	it("should rewind state and artifacts", async () => {
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
			filename: "f1",
			artifact: { text: "f1v0" },
		});

		const event1 = new Event({
			invocationId: "invocation1",
			author: "agent",
			content: { role: "model", parts: [{ text: "event1" }] },
			actions: new EventActions({
				stateDelta: { k1: "v1" },
				artifactDelta: { f1: 0 },
			}),
		});
		await runner.sessionService.appendEvent(session, event1);

		await runner.artifactService?.saveArtifact({
			appName: runner.appName,
			userId,
			sessionId,
			filename: "f1",
			artifact: { text: "f1v1" },
		});

		await runner.artifactService?.saveArtifact({
			appName: runner.appName,
			userId,
			sessionId,
			filename: "f2",
			artifact: { text: "f2v0" },
		});

		const event2 = new Event({
			invocationId: "invocation2",
			author: "agent",
			content: { role: "model", parts: [{ text: "event2" }] },
			actions: new EventActions({
				stateDelta: { k1: "v2", k2: "v2" },
				artifactDelta: { f1: 1, f2: 0 },
			}),
		});
		await runner.sessionService.appendEvent(session, event2);

		const event3 = new Event({
			invocationId: "invocation3",
			author: "agent",
			content: { role: "model", parts: [{ text: "event3" }] },
			actions: new EventActions({
				stateDelta: { k2: "v3" },
			}),
		});
		await runner.sessionService.appendEvent(session, event3);

		let updatedSession = await runner.sessionService.getSession(
			runner.appName,
			userId,
			sessionId,
		);
		expect(updatedSession?.state).toEqual({ k1: "v2", k2: "v3" });

		const f1BeforeRewind = await runner.artifactService?.loadArtifact({
			appName: runner.appName,
			userId,
			sessionId,
			filename: "f1",
		});
		expect(f1BeforeRewind).toEqual({ text: "f1v1" });

		const f2BeforeRewind = await runner.artifactService?.loadArtifact({
			appName: runner.appName,
			userId,
			sessionId,
			filename: "f2",
		});
		expect(f2BeforeRewind).toEqual({ text: "f2v0" });

		await runner.rewind({
			userId,
			sessionId,
			rewindBeforeInvocationId: "invocation2",
		});

		updatedSession = await runner.sessionService.getSession(
			runner.appName,
			userId,
			sessionId,
		);

		expect(updatedSession?.state.k1).toBe("v1");
		expect(updatedSession?.state.k2).toBeUndefined();

		const f1AfterRewind = await runner.artifactService?.loadArtifact({
			appName: runner.appName,
			userId,
			sessionId,
			filename: "f1",
		});
		expect(f1AfterRewind).toEqual({ text: "f1v0" });

		const f2AfterRewind = await runner.artifactService?.loadArtifact({
			appName: runner.appName,
			userId,
			sessionId,
			filename: "f2",
		});
		expect(f2AfterRewind).toBeNull();
	});

	it("should rewind to middle invocation", async () => {
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
			filename: "f1",
			artifact: { text: "f1v0" },
		});

		const event1 = new Event({
			invocationId: "invocation1",
			author: "agent",
			content: { role: "model", parts: [{ text: "event1" }] },
			actions: new EventActions({
				stateDelta: { k1: "v1" },
				artifactDelta: { f1: 0 },
			}),
		});
		await runner.sessionService.appendEvent(session, event1);

		await runner.artifactService?.saveArtifact({
			appName: runner.appName,
			userId,
			sessionId,
			filename: "f1",
			artifact: { text: "f1v1" },
		});

		await runner.artifactService?.saveArtifact({
			appName: runner.appName,
			userId,
			sessionId,
			filename: "f2",
			artifact: { text: "f2v0" },
		});

		const event2 = new Event({
			invocationId: "invocation2",
			author: "agent",
			content: { role: "model", parts: [{ text: "event2" }] },
			actions: new EventActions({
				stateDelta: { k1: "v2", k2: "v2" },
				artifactDelta: { f1: 1, f2: 0 },
			}),
		});
		await runner.sessionService.appendEvent(session, event2);

		const event3 = new Event({
			invocationId: "invocation3",
			author: "agent",
			content: { role: "model", parts: [{ text: "event3" }] },
			actions: new EventActions({
				stateDelta: { k2: "v3" },
			}),
		});
		await runner.sessionService.appendEvent(session, event3);

		await runner.rewind({
			userId,
			sessionId,
			rewindBeforeInvocationId: "invocation3",
		});

		const updatedSession = await runner.sessionService.getSession(
			runner.appName,
			userId,
			sessionId,
		);

		expect(updatedSession?.state).toEqual({ k1: "v2", k2: "v2" });

		const f1 = await runner.artifactService?.loadArtifact({
			appName: runner.appName,
			userId,
			sessionId,
			filename: "f1",
		});
		expect(f1).toEqual({ text: "f1v1" });

		const f2 = await runner.artifactService?.loadArtifact({
			appName: runner.appName,
			userId,
			sessionId,
			filename: "f2",
		});
		expect(f2).toEqual({ text: "f2v0" });
	});

	it("should throw error for non-existent invocation", async () => {
		const session = await runner.sessionService.createSession(
			runner.appName,
			userId,
			{},
			sessionId,
		);

		const event1 = new Event({
			invocationId: "invocation1",
			author: "agent",
			content: { role: "model", parts: [{ text: "event1" }] },
		});
		await runner.sessionService.appendEvent(session, event1);

		await expect(
			runner.rewind({
				userId,
				sessionId,
				rewindBeforeInvocationId: "non_existent",
			}),
		).rejects.toThrow("Invocation ID not found: non_existent");
	});

	it("should throw error for non-existent session", async () => {
		await expect(
			runner.rewind({
				userId,
				sessionId: "non_existent_session",
				rewindBeforeInvocationId: "invocation1",
			}),
		).rejects.toThrow("Session not found: non_existent_session");
	});

	it("ignores app: and user: keys when computing rewind state delta", async () => {
		const session = await runner.sessionService.createSession(
			runner.appName,
			userId,
			{},
			sessionId,
		);

		await runner.sessionService.appendEvent(
			session,
			new Event({
				invocationId: "invocation1",
				author: "agent",
				content: { role: "model", parts: [{ text: "one" }] },
				actions: new EventActions({
					stateDelta: {
						local: "v1",
						"app:theme": "dark",
						"user:locale": "en",
					},
				}),
			}),
		);
		await runner.sessionService.appendEvent(
			session,
			new Event({
				invocationId: "invocation2",
				author: "agent",
				content: { role: "model", parts: [{ text: "two" }] },
				actions: new EventActions({
					stateDelta: {
						local: "v2",
						extra: "later",
						"app:theme": "light",
					},
				}),
			}),
		);

		await runner.rewind({
			userId,
			sessionId,
			rewindBeforeInvocationId: "invocation2",
		});

		const updated = await runner.sessionService.getSession(
			runner.appName,
			userId,
			sessionId,
		);
		expect(updated?.state.local).toBe("v1");
		expect(updated?.state.extra).toBeUndefined();
		expect(updated?.state["app:theme"]).toBe("light");
		expect(updated?.state["user:locale"]).toBe("en");
		expect(updated?.events.at(-1)?.actions?.rewindBeforeInvocationId).toBe(
			"invocation2",
		);
	});

	it("returns empty artifact delta when artifactService is missing", async () => {
		const rootAgent = new LlmAgent({
			name: "test_agent",
			model: "gemini-2.0-flash-exp",
			description: "",
		});
		const sessionService = new InMemorySessionService();
		const bareRunner = new Runner({
			appName: "test_app",
			agent: rootAgent,
			sessionService,
		});
		const session = await bareRunner.sessionService.createSession(
			bareRunner.appName,
			userId,
			{},
			sessionId,
		);
		await bareRunner.sessionService.appendEvent(
			session,
			new Event({
				invocationId: "invocation1",
				author: "agent",
				content: { role: "model", parts: [{ text: "one" }] },
				actions: new EventActions({
					stateDelta: { k: "v1" },
					artifactDelta: { f1: 0 },
				}),
			}),
		);
		await bareRunner.sessionService.appendEvent(
			session,
			new Event({
				invocationId: "invocation2",
				author: "agent",
				content: { role: "model", parts: [{ text: "two" }] },
				actions: new EventActions({
					stateDelta: { k: "v2" },
					artifactDelta: { f1: 1 },
				}),
			}),
		);

		await bareRunner.rewind({
			userId,
			sessionId,
			rewindBeforeInvocationId: "invocation2",
		});

		const updated = await bareRunner.sessionService.getSession(
			bareRunner.appName,
			userId,
			sessionId,
		);
		expect(updated?.state.k).toBe("v1");
		expect(updated?.events.at(-1)?.actions?.artifactDelta).toEqual({});
	});

	it("treats null stateDelta values as deletions when computing rewind point", async () => {
		const session = await runner.sessionService.createSession(
			runner.appName,
			userId,
			{},
			sessionId,
		);

		await runner.sessionService.appendEvent(
			session,
			new Event({
				invocationId: "invocation1",
				author: "agent",
				content: { role: "model", parts: [{ text: "one" }] },
				actions: new EventActions({
					stateDelta: { keep: "a", gone: "b" },
				}),
			}),
		);
		await runner.sessionService.appendEvent(
			session,
			new Event({
				invocationId: "invocation2",
				author: "agent",
				content: { role: "model", parts: [{ text: "two" }] },
				actions: new EventActions({
					stateDelta: { gone: null, keep: "a2" },
				}),
			}),
		);
		await runner.sessionService.appendEvent(
			session,
			new Event({
				invocationId: "invocation3",
				author: "agent",
				content: { role: "model", parts: [{ text: "three" }] },
				actions: new EventActions({
					stateDelta: { keep: "a3", extra: "x" },
				}),
			}),
		);

		await runner.rewind({
			userId,
			sessionId,
			rewindBeforeInvocationId: "invocation3",
		});

		const updated = await runner.sessionService.getSession(
			runner.appName,
			userId,
			sessionId,
		);
		expect(updated?.state.keep).toBe("a2");
		expect(updated?.state.gone).toBeUndefined();
		expect(updated?.state.extra).toBeUndefined();
	});

	it("skips user: prefixed artifacts and restores missing pre-rewind files as empty blobs", async () => {
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
			filename: "session-file",
			artifact: { text: "v0" },
		});
		await runner.artifactService?.saveArtifact({
			appName: runner.appName,
			userId,
			sessionId,
			filename: "user:profile",
			artifact: { text: "user-v0" },
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
			sessionId,
			filename: "session-file",
			artifact: { text: "v1" },
		});
		await runner.artifactService?.saveArtifact({
			appName: runner.appName,
			userId,
			sessionId,
			filename: "user:profile",
			artifact: { text: "user-v1" },
		});

		await runner.sessionService.appendEvent(
			session,
			new Event({
				invocationId: "invocation2",
				author: "agent",
				content: { role: "model", parts: [{ text: "two" }] },
				actions: new EventActions({
					artifactDelta: {
						"session-file": 1,
						"user:profile": 1,
					},
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

		expect(Object.keys(rewindDelta)).not.toContain("user:profile");
		expect(rewindDelta["session-file"]).toBeDefined();

		const emptyBlobCall = saveSpy.mock.calls.find(
			([args]) =>
				args.filename === "session-file" &&
				args.artifact?.inlineData?.mimeType === "application/octet-stream",
		);
		expect(emptyBlobCall).toBeTruthy();
	});

	it("treats undefined stateDelta values as deletions when computing rewind point", async () => {
		const session = await runner.sessionService.createSession(
			runner.appName,
			userId,
			{},
			sessionId,
		);

		await runner.sessionService.appendEvent(
			session,
			new Event({
				invocationId: "invocation1",
				author: "agent",
				content: { role: "model", parts: [{ text: "one" }] },
				actions: new EventActions({
					stateDelta: { keep: "a", gone: "b" },
				}),
			}),
		);
		await runner.sessionService.appendEvent(
			session,
			new Event({
				invocationId: "invocation2",
				author: "agent",
				content: { role: "model", parts: [{ text: "two" }] },
				actions: new EventActions({
					stateDelta: { gone: undefined, keep: "a2" },
				}),
			}),
		);
		await runner.sessionService.appendEvent(
			session,
			new Event({
				invocationId: "invocation3",
				author: "agent",
				content: { role: "model", parts: [{ text: "three" }] },
				actions: new EventActions({
					stateDelta: { keep: "a3", extra: "x" },
				}),
			}),
		);

		await runner.rewind({
			userId,
			sessionId,
			rewindBeforeInvocationId: "invocation3",
		});

		const updated = await runner.sessionService.getSession(
			runner.appName,
			userId,
			sessionId,
		);
		expect(updated?.state.keep).toBe("a2");
		expect(updated?.state.gone).toBeUndefined();
		expect(updated?.state.extra).toBeUndefined();
	});

	it("omits state keys whose rewind-point value already matches current state", async () => {
		const session = await runner.sessionService.createSession(
			runner.appName,
			userId,
			{},
			sessionId,
		);

		await runner.sessionService.appendEvent(
			session,
			new Event({
				invocationId: "invocation1",
				author: "agent",
				content: { role: "model", parts: [{ text: "one" }] },
				actions: new EventActions({
					stateDelta: { stable: "same", changing: "v1" },
				}),
			}),
		);
		await runner.sessionService.appendEvent(
			session,
			new Event({
				invocationId: "invocation2",
				author: "agent",
				content: { role: "model", parts: [{ text: "two" }] },
				actions: new EventActions({
					stateDelta: { changing: "v2" },
				}),
			}),
		);

		await runner.rewind({
			userId,
			sessionId,
			rewindBeforeInvocationId: "invocation2",
		});

		const updated = await runner.sessionService.getSession(
			runner.appName,
			userId,
			sessionId,
		);
		const rewindDelta = updated?.events.at(-1)?.actions?.stateDelta ?? {};
		expect(rewindDelta.changing).toBe("v1");
		expect(Object.keys(rewindDelta)).not.toContain("stable");
		expect(updated?.state.stable).toBe("same");
		expect(updated?.state.changing).toBe("v1");
	});

	it("nulls all session-scoped state when rewinding before the first event", async () => {
		const session = await runner.sessionService.createSession(
			runner.appName,
			userId,
			{},
			sessionId,
		);

		await runner.sessionService.appendEvent(
			session,
			new Event({
				invocationId: "invocation1",
				author: "agent",
				content: { role: "model", parts: [{ text: "one" }] },
				actions: new EventActions({
					stateDelta: {
						local: "v1",
						"app:theme": "dark",
						"user:locale": "en",
					},
				}),
			}),
		);

		await runner.rewind({
			userId,
			sessionId,
			rewindBeforeInvocationId: "invocation1",
		});

		const updated = await runner.sessionService.getSession(
			runner.appName,
			userId,
			sessionId,
		);
		expect(updated?.state.local).toBeUndefined();
		expect(updated?.state["app:theme"]).toBe("dark");
		expect(updated?.state["user:locale"]).toBe("en");
		expect(updated?.events.at(-1)?.actions?.stateDelta).toEqual({
			local: null,
		});
	});

	it("uses the first matching invocation id when duplicates exist", async () => {
		const session = await runner.sessionService.createSession(
			runner.appName,
			userId,
			{},
			sessionId,
		);

		await runner.sessionService.appendEvent(
			session,
			new Event({
				invocationId: "dup",
				author: "agent",
				content: { role: "model", parts: [{ text: "first" }] },
				actions: new EventActions({
					stateDelta: { marker: "at-first" },
				}),
			}),
		);
		await runner.sessionService.appendEvent(
			session,
			new Event({
				invocationId: "middle",
				author: "agent",
				content: { role: "model", parts: [{ text: "middle" }] },
				actions: new EventActions({
					stateDelta: { marker: "at-middle" },
				}),
			}),
		);
		await runner.sessionService.appendEvent(
			session,
			new Event({
				invocationId: "dup",
				author: "agent",
				content: { role: "model", parts: [{ text: "second-dup" }] },
				actions: new EventActions({
					stateDelta: { marker: "at-second-dup", later: "x" },
				}),
			}),
		);

		await runner.rewind({
			userId,
			sessionId,
			rewindBeforeInvocationId: "dup",
		});

		const updated = await runner.sessionService.getSession(
			runner.appName,
			userId,
			sessionId,
		);
		expect(updated?.state.marker).toBeUndefined();
		expect(updated?.state.later).toBeUndefined();
		expect(updated?.events.at(-1)?.actions?.stateDelta).toEqual({
			marker: null,
			later: null,
		});
	});

	it("skips events without actions while computing rewind deltas", async () => {
		const session = await runner.sessionService.createSession(
			runner.appName,
			userId,
			{},
			sessionId,
		);

		await runner.sessionService.appendEvent(
			session,
			new Event({
				invocationId: "invocation1",
				author: "agent",
				content: { role: "model", parts: [{ text: "bare" }] },
			}),
		);
		await runner.sessionService.appendEvent(
			session,
			new Event({
				invocationId: "invocation2",
				author: "agent",
				content: { role: "model", parts: [{ text: "with-state" }] },
				actions: new EventActions({
					stateDelta: { k: "v2" },
				}),
			}),
		);

		await expect(
			runner.rewind({
				userId,
				sessionId,
				rewindBeforeInvocationId: "invocation2",
			}),
		).resolves.toBeUndefined();

		const updated = await runner.sessionService.getSession(
			runner.appName,
			userId,
			sessionId,
		);
		expect(updated?.state.k).toBeUndefined();
	});

	it("appends a user rewind event with metadata and logs the invocation id", async () => {
		const session = await runner.sessionService.createSession(
			runner.appName,
			userId,
			{},
			sessionId,
		);
		await runner.sessionService.appendEvent(
			session,
			new Event({
				invocationId: "invocation1",
				author: "agent",
				content: { role: "model", parts: [{ text: "one" }] },
				actions: new EventActions({
					stateDelta: { k: "v1" },
				}),
			}),
		);
		await runner.sessionService.appendEvent(
			session,
			new Event({
				invocationId: "invocation2",
				author: "agent",
				content: { role: "model", parts: [{ text: "two" }] },
				actions: new EventActions({
					stateDelta: { k: "v2" },
				}),
			}),
		);

		const infoSpy = vi
			.spyOn((runner as any).logger, "info")
			.mockImplementation(() => {});

		await runner.rewind({
			userId,
			sessionId,
			rewindBeforeInvocationId: "invocation2",
		});

		expect(infoSpy).toHaveBeenCalledWith(
			"Rewinding session to invocation:",
			"invocation2",
		);

		const updated = await runner.sessionService.getSession(
			runner.appName,
			userId,
			sessionId,
		);
		const rewindEvent = updated?.events.at(-1);
		expect(rewindEvent?.author).toBe("user");
		expect(rewindEvent?.actions?.rewindBeforeInvocationId).toBe("invocation2");
		expect(rewindEvent?.actions?.stateDelta).toEqual({ k: "v1" });
		expect(rewindEvent?.invocationId).toBeTruthy();
		expect(rewindEvent?.invocationId).not.toBe("invocation2");
	});

	it("skips artifact saves when version at rewind point equals current version", async () => {
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
			filename: "stable",
			artifact: { text: "v0" },
		});
		await runner.artifactService?.saveArtifact({
			appName: runner.appName,
			userId,
			sessionId,
			filename: "changing",
			artifact: { text: "c0" },
		});

		await runner.sessionService.appendEvent(
			session,
			new Event({
				invocationId: "invocation1",
				author: "agent",
				content: { role: "model", parts: [{ text: "one" }] },
				actions: new EventActions({
					artifactDelta: { stable: 0, changing: 0 },
				}),
			}),
		);

		await runner.artifactService?.saveArtifact({
			appName: runner.appName,
			userId,
			sessionId,
			filename: "changing",
			artifact: { text: "c1" },
		});

		await runner.sessionService.appendEvent(
			session,
			new Event({
				invocationId: "invocation2",
				author: "agent",
				content: { role: "model", parts: [{ text: "two" }] },
				actions: new EventActions({
					artifactDelta: { changing: 1 },
				}),
			}),
		);

		const saveSpy = vi.spyOn(runner.artifactService!, "saveArtifact");

		await runner.rewind({
			userId,
			sessionId,
			rewindBeforeInvocationId: "invocation2",
		});

		const savedFilenames = saveSpy.mock.calls.map(([args]) => args.filename);
		expect(savedFilenames).toContain("changing");
		expect(savedFilenames).not.toContain("stable");

		const rewindDelta =
			(
				await runner.sessionService.getSession(
					runner.appName,
					userId,
					sessionId,
				)
			)?.events.at(-1)?.actions?.artifactDelta ?? {};
		expect(Object.keys(rewindDelta)).toEqual(["changing"]);
		expect(Object.keys(rewindDelta)).not.toContain("stable");
	});

	it("restores prior artifact versions via fileData artifact URIs", async () => {
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
			filename: "doc",
			artifact: { text: "v0" },
		});

		await runner.sessionService.appendEvent(
			session,
			new Event({
				invocationId: "invocation1",
				author: "agent",
				content: { role: "model", parts: [{ text: "one" }] },
				actions: new EventActions({
					artifactDelta: { doc: 0 },
				}),
			}),
		);

		await runner.artifactService?.saveArtifact({
			appName: runner.appName,
			userId,
			sessionId,
			filename: "doc",
			artifact: { text: "v1" },
		});

		await runner.sessionService.appendEvent(
			session,
			new Event({
				invocationId: "invocation2",
				author: "agent",
				content: { role: "model", parts: [{ text: "two" }] },
				actions: new EventActions({
					artifactDelta: { doc: 1 },
				}),
			}),
		);

		const saveSpy = vi.spyOn(runner.artifactService!, "saveArtifact");
		const expectedUri = getArtifactUri({
			appName: runner.appName,
			userId,
			sessionId,
			filename: "doc",
			version: 0,
		});

		await runner.rewind({
			userId,
			sessionId,
			rewindBeforeInvocationId: "invocation2",
		});

		const fileDataCall = saveSpy.mock.calls.find(
			([args]) =>
				args.filename === "doc" &&
				args.artifact?.fileData?.fileUri === expectedUri,
		);
		expect(fileDataCall).toBeTruthy();

		const loaded = await runner.artifactService?.loadArtifact({
			appName: runner.appName,
			userId,
			sessionId,
			filename: "doc",
		});
		expect(loaded).toEqual({ text: "v0" });
	});

	it("mixes unchanged, empty-blob, and fileData artifact restores in one rewind", async () => {
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
			filename: "keep",
			artifact: { text: "keep-v0" },
		});
		await runner.artifactService?.saveArtifact({
			appName: runner.appName,
			userId,
			sessionId,
			filename: "restore",
			artifact: { text: "restore-v0" },
		});

		await runner.sessionService.appendEvent(
			session,
			new Event({
				invocationId: "invocation1",
				author: "agent",
				content: { role: "model", parts: [{ text: "one" }] },
				actions: new EventActions({
					artifactDelta: { keep: 0, restore: 0 },
				}),
			}),
		);

		await runner.artifactService?.saveArtifact({
			appName: runner.appName,
			userId,
			sessionId,
			filename: "restore",
			artifact: { text: "restore-v1" },
		});
		await runner.artifactService?.saveArtifact({
			appName: runner.appName,
			userId,
			sessionId,
			filename: "brand-new",
			artifact: { text: "new-v0" },
		});

		await runner.sessionService.appendEvent(
			session,
			new Event({
				invocationId: "invocation2",
				author: "agent",
				content: { role: "model", parts: [{ text: "two" }] },
				actions: new EventActions({
					artifactDelta: { restore: 1, "brand-new": 0 },
				}),
			}),
		);

		const saveSpy = vi.spyOn(runner.artifactService!, "saveArtifact");

		await runner.rewind({
			userId,
			sessionId,
			rewindBeforeInvocationId: "invocation2",
		});

		const savedByName = Object.fromEntries(
			saveSpy.mock.calls.map(([args]) => [args.filename, args.artifact]),
		);
		expect(savedByName.keep).toBeUndefined();
		expect(savedByName.restore?.fileData?.fileUri).toBe(
			getArtifactUri({
				appName: runner.appName,
				userId,
				sessionId,
				filename: "restore",
				version: 0,
			}),
		);
		expect(savedByName["brand-new"]?.inlineData).toEqual({
			mimeType: "application/octet-stream",
			data: "",
		});

		const rewindDelta =
			(
				await runner.sessionService.getSession(
					runner.appName,
					userId,
					sessionId,
				)
			)?.events.at(-1)?.actions?.artifactDelta ?? {};
		expect(Object.keys(rewindDelta).sort()).toEqual(
			["brand-new", "restore"].sort(),
		);
	});

	it("produces an empty state delta when only content events exist before rewind", async () => {
		const session = await runner.sessionService.createSession(
			runner.appName,
			userId,
			{},
			sessionId,
		);

		await runner.sessionService.appendEvent(
			session,
			new Event({
				invocationId: "invocation1",
				author: "agent",
				content: { role: "model", parts: [{ text: "one" }] },
			}),
		);
		await runner.sessionService.appendEvent(
			session,
			new Event({
				invocationId: "invocation2",
				author: "agent",
				content: { role: "model", parts: [{ text: "two" }] },
			}),
		);

		await runner.rewind({
			userId,
			sessionId,
			rewindBeforeInvocationId: "invocation2",
		});

		const updated = await runner.sessionService.getSession(
			runner.appName,
			userId,
			sessionId,
		);
		expect(updated?.events.at(-1)?.actions?.stateDelta).toEqual({});
		expect(updated?.events.at(-1)?.actions?.artifactDelta).toEqual({});
	});

	it("merges overlapping artifact deltas across multiple pre-rewind events", async () => {
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
			filename: "doc",
			artifact: { text: "v0" },
		});
		await runner.sessionService.appendEvent(
			session,
			new Event({
				invocationId: "invocation1",
				author: "agent",
				content: { role: "model", parts: [{ text: "one" }] },
				actions: new EventActions({
					artifactDelta: { doc: 0 },
				}),
			}),
		);

		await runner.artifactService?.saveArtifact({
			appName: runner.appName,
			userId,
			sessionId,
			filename: "doc",
			artifact: { text: "v1" },
		});
		await runner.sessionService.appendEvent(
			session,
			new Event({
				invocationId: "invocation2",
				author: "agent",
				content: { role: "model", parts: [{ text: "two" }] },
				actions: new EventActions({
					artifactDelta: { doc: 1 },
				}),
			}),
		);

		await runner.artifactService?.saveArtifact({
			appName: runner.appName,
			userId,
			sessionId,
			filename: "doc",
			artifact: { text: "v2" },
		});
		await runner.sessionService.appendEvent(
			session,
			new Event({
				invocationId: "invocation3",
				author: "agent",
				content: { role: "model", parts: [{ text: "three" }] },
				actions: new EventActions({
					artifactDelta: { doc: 2 },
				}),
			}),
		);

		const saveSpy = vi.spyOn(runner.artifactService!, "saveArtifact");
		const expectedUri = getArtifactUri({
			appName: runner.appName,
			userId,
			sessionId,
			filename: "doc",
			version: 1,
		});

		await runner.rewind({
			userId,
			sessionId,
			rewindBeforeInvocationId: "invocation3",
		});

		const fileDataCall = saveSpy.mock.calls.find(
			([args]) =>
				args.filename === "doc" &&
				args.artifact?.fileData?.fileUri === expectedUri,
		);
		expect(fileDataCall).toBeTruthy();

		const loaded = await runner.artifactService?.loadArtifact({
			appName: runner.appName,
			userId,
			sessionId,
			filename: "doc",
		});
		expect(loaded).toEqual({ text: "v1" });
	});

	it("restores a key deleted after the rewind point back into session state", async () => {
		const session = await runner.sessionService.createSession(
			runner.appName,
			userId,
			{},
			sessionId,
		);

		await runner.sessionService.appendEvent(
			session,
			new Event({
				invocationId: "invocation1",
				author: "agent",
				content: { role: "model", parts: [{ text: "one" }] },
				actions: new EventActions({
					stateDelta: { resurrect: "alive" },
				}),
			}),
		);
		await runner.sessionService.appendEvent(
			session,
			new Event({
				invocationId: "invocation2",
				author: "agent",
				content: { role: "model", parts: [{ text: "two" }] },
				actions: new EventActions({
					stateDelta: { resurrect: null },
				}),
			}),
		);

		await runner.rewind({
			userId,
			sessionId,
			rewindBeforeInvocationId: "invocation2",
		});

		const updated = await runner.sessionService.getSession(
			runner.appName,
			userId,
			sessionId,
		);
		expect(updated?.state.resurrect).toBe("alive");
		expect(updated?.events.at(-1)?.actions?.stateDelta).toEqual({
			resurrect: "alive",
		});
	});

	it("leaves app: and user: keys untouched when nulling session-scoped keys only", async () => {
		const session = await runner.sessionService.createSession(
			runner.appName,
			userId,
			{},
			sessionId,
		);

		await runner.sessionService.appendEvent(
			session,
			new Event({
				invocationId: "invocation1",
				author: "agent",
				content: { role: "model", parts: [{ text: "one" }] },
				actions: new EventActions({
					stateDelta: {
						"app:theme": "dark",
						"user:locale": "en",
					},
				}),
			}),
		);
		await runner.sessionService.appendEvent(
			session,
			new Event({
				invocationId: "invocation2",
				author: "agent",
				content: { role: "model", parts: [{ text: "two" }] },
				actions: new EventActions({
					stateDelta: {
						local: "temp",
						"app:theme": "light",
					},
				}),
			}),
		);

		await runner.rewind({
			userId,
			sessionId,
			rewindBeforeInvocationId: "invocation2",
		});

		const updated = await runner.sessionService.getSession(
			runner.appName,
			userId,
			sessionId,
		);
		expect(updated?.state.local).toBeUndefined();
		expect(updated?.state["app:theme"]).toBe("light");
		expect(updated?.state["user:locale"]).toBe("en");
		expect(updated?.events.at(-1)?.actions?.stateDelta).toEqual({
			local: null,
		});
	});

	it("produces an empty artifact delta when every version already matches", async () => {
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
			filename: "stable",
			artifact: { text: "v0" },
		});

		await runner.sessionService.appendEvent(
			session,
			new Event({
				invocationId: "invocation1",
				author: "agent",
				content: { role: "model", parts: [{ text: "one" }] },
				actions: new EventActions({
					artifactDelta: { stable: 0 },
					stateDelta: { k: "v1" },
				}),
			}),
		);
		await runner.sessionService.appendEvent(
			session,
			new Event({
				invocationId: "invocation2",
				author: "agent",
				content: { role: "model", parts: [{ text: "two" }] },
				actions: new EventActions({
					stateDelta: { k: "v2" },
				}),
			}),
		);

		const saveSpy = vi.spyOn(runner.artifactService!, "saveArtifact");

		await runner.rewind({
			userId,
			sessionId,
			rewindBeforeInvocationId: "invocation2",
		});

		expect(saveSpy).not.toHaveBeenCalled();
		const updated = await runner.sessionService.getSession(
			runner.appName,
			userId,
			sessionId,
		);
		expect(updated?.events.at(-1)?.actions?.artifactDelta).toEqual({});
		expect(updated?.state.k).toBe("v1");
	});

	it("treats null artifact versions at the rewind point as empty-blob restores", async () => {
		const session = await runner.sessionService.createSession(
			runner.appName,
			userId,
			{},
			sessionId,
		);

		await runner.sessionService.appendEvent(
			session,
			new Event({
				invocationId: "invocation1",
				author: "agent",
				content: { role: "model", parts: [{ text: "one" }] },
				actions: new EventActions({
					artifactDelta: { spooky: null as unknown as number },
				}),
			}),
		);

		await runner.artifactService?.saveArtifact({
			appName: runner.appName,
			userId,
			sessionId,
			filename: "spooky",
			artifact: { text: "later" },
		});
		await runner.sessionService.appendEvent(
			session,
			new Event({
				invocationId: "invocation2",
				author: "agent",
				content: { role: "model", parts: [{ text: "two" }] },
				actions: new EventActions({
					artifactDelta: { spooky: 0 },
				}),
			}),
		);

		const saveSpy = vi.spyOn(runner.artifactService!, "saveArtifact");

		await runner.rewind({
			userId,
			sessionId,
			rewindBeforeInvocationId: "invocation2",
		});

		const emptyBlobCall = saveSpy.mock.calls.find(
			([args]) =>
				args.filename === "spooky" &&
				args.artifact?.inlineData?.mimeType === "application/octet-stream" &&
				args.artifact?.inlineData?.data === "",
		);
		expect(emptyBlobCall).toBeTruthy();
	});

	it("skips events whose actions omit stateDelta while still applying later deltas", async () => {
		const session = await runner.sessionService.createSession(
			runner.appName,
			userId,
			{},
			sessionId,
		);

		const bareActions = new EventActions();
		delete (bareActions as { stateDelta?: unknown }).stateDelta;

		await runner.sessionService.appendEvent(
			session,
			new Event({
				invocationId: "invocation1",
				author: "agent",
				content: { role: "model", parts: [{ text: "bare-actions" }] },
				actions: bareActions,
			}),
		);
		await runner.sessionService.appendEvent(
			session,
			new Event({
				invocationId: "invocation2",
				author: "agent",
				content: { role: "model", parts: [{ text: "with-state" }] },
				actions: new EventActions({
					stateDelta: { k: "v2" },
				}),
			}),
		);
		await runner.sessionService.appendEvent(
			session,
			new Event({
				invocationId: "invocation3",
				author: "agent",
				content: { role: "model", parts: [{ text: "later" }] },
				actions: new EventActions({
					stateDelta: { k: "v3" },
				}),
			}),
		);

		await runner.rewind({
			userId,
			sessionId,
			rewindBeforeInvocationId: "invocation3",
		});

		const updated = await runner.sessionService.getSession(
			runner.appName,
			userId,
			sessionId,
		);
		expect(updated?.state.k).toBe("v2");
	});

	it("rewinds state and artifacts together in a single rewind event", async () => {
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
			filename: "combo",
			artifact: { text: "c0" },
		});
		await runner.sessionService.appendEvent(
			session,
			new Event({
				invocationId: "invocation1",
				author: "agent",
				content: { role: "model", parts: [{ text: "one" }] },
				actions: new EventActions({
					stateDelta: { a: "1", b: "1" },
					artifactDelta: { combo: 0 },
				}),
			}),
		);

		await runner.artifactService?.saveArtifact({
			appName: runner.appName,
			userId,
			sessionId,
			filename: "combo",
			artifact: { text: "c1" },
		});
		await runner.artifactService?.saveArtifact({
			appName: runner.appName,
			userId,
			sessionId,
			filename: "extra",
			artifact: { text: "e0" },
		});
		await runner.sessionService.appendEvent(
			session,
			new Event({
				invocationId: "invocation2",
				author: "agent",
				content: { role: "model", parts: [{ text: "two" }] },
				actions: new EventActions({
					stateDelta: { a: "2", c: "2" },
					artifactDelta: { combo: 1, extra: 0 },
				}),
			}),
		);

		await runner.rewind({
			userId,
			sessionId,
			rewindBeforeInvocationId: "invocation2",
		});

		const updated = await runner.sessionService.getSession(
			runner.appName,
			userId,
			sessionId,
		);
		expect(updated?.state.a).toBe("1");
		expect(updated?.state.b).toBe("1");
		expect(updated?.state.c).toBeUndefined();

		const combo = await runner.artifactService?.loadArtifact({
			appName: runner.appName,
			userId,
			sessionId,
			filename: "combo",
		});
		expect(combo).toEqual({ text: "c0" });
		const extra = await runner.artifactService?.loadArtifact({
			appName: runner.appName,
			userId,
			sessionId,
			filename: "extra",
		});
		expect(extra).toBeNull();

		const rewindEvent = updated?.events.at(-1);
		expect(rewindEvent?.actions?.rewindBeforeInvocationId).toBe("invocation2");
		expect(rewindEvent?.actions?.stateDelta).toEqual({
			a: "1",
			c: null,
		});
		expect(
			Object.keys(rewindEvent?.actions?.artifactDelta ?? {}).sort(),
		).toEqual(["combo", "extra"].sort());
	});

	it("ignores artifactDelta on events after the rewind point when computing versions at rewind", async () => {
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
			filename: "only-later",
			artifact: { text: "v0" },
		});

		await runner.sessionService.appendEvent(
			session,
			new Event({
				invocationId: "invocation1",
				author: "agent",
				content: { role: "model", parts: [{ text: "one" }] },
			}),
		);
		await runner.sessionService.appendEvent(
			session,
			new Event({
				invocationId: "invocation2",
				author: "agent",
				content: { role: "model", parts: [{ text: "two" }] },
				actions: new EventActions({
					artifactDelta: { "only-later": 0 },
				}),
			}),
		);

		const saveSpy = vi.spyOn(runner.artifactService!, "saveArtifact");

		await runner.rewind({
			userId,
			sessionId,
			rewindBeforeInvocationId: "invocation2",
		});

		const emptyBlobCall = saveSpy.mock.calls.find(
			([args]) =>
				args.filename === "only-later" &&
				args.artifact?.inlineData?.mimeType === "application/octet-stream",
		);
		expect(emptyBlobCall).toBeTruthy();
	});
});
