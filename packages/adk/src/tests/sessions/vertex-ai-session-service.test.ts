import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Event } from "../../events/event";
import { EventActions } from "../../events/event-actions";
import { VertexAiSessionService } from "../../sessions/vertex-ai-session-service";

function createService(
	options: ConstructorParameters<typeof VertexAiSessionService>[0] = {
		agentEngineId: "9",
	},
) {
	const asyncRequest = vi.fn();
	const service = new VertexAiSessionService(options);
	(service as any).getApiClient = () => ({ async_request: asyncRequest });
	return { service, asyncRequest };
}

describe("VertexAiSessionService", () => {
	beforeEach(() => {
		vi.spyOn(console, "debug").mockImplementation(() => undefined);
		vi.spyOn(console, "error").mockImplementation(() => undefined);
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it("stores constructor options and rejects user-provided session ids", async () => {
		const { service, asyncRequest } = createService({
			project: "proj",
			location: "us-central1",
			agentEngineId: "12345",
		});

		await expect(
			service.createSession("app", "user", {}, "custom-id"),
		).rejects.toThrow(/User-provided Session id is not supported/);
		expect(asyncRequest).not.toHaveBeenCalled();
	});

	it("createSession posts, waits for LRO, then returns the session resource", async () => {
		const { service, asyncRequest } = createService({
			project: "proj",
			location: "us-central1",
			agentEngineId: "999",
		});
		asyncRequest
			.mockResolvedValueOnce({
				name: "projects/p/locations/l/reasoningEngines/999/sessions/sess-abc/operations/op-1",
			})
			.mockResolvedValueOnce({ done: true })
			.mockResolvedValueOnce({
				name: "projects/p/locations/l/reasoningEngines/999/sessions/sess-abc",
				updateTime: "2024-01-01T00:00:00.000Z",
				sessionState: { k: "v" },
			});

		const session = await service.createSession("ignored-app", "user-1", {
			seed: true,
		});

		expect(asyncRequest).toHaveBeenNthCalledWith(1, {
			http_method: "POST",
			path: "reasoningEngines/999/sessions",
			request_dict: { user_id: "user-1", session_state: { seed: true } },
		});
		expect(asyncRequest).toHaveBeenNthCalledWith(2, {
			http_method: "GET",
			path: "operations/op-1",
			request_dict: {},
		});
		expect(session).toMatchObject({
			appName: "ignored-app",
			userId: "user-1",
			id: "sess-abc",
			state: { k: "v" },
			events: [],
			lastUpdateTime: Date.parse("2024-01-01T00:00:00.000Z") / 1000,
		});
	});

	it("createSession without state omits session_state and uses numeric appName as engine id", async () => {
		const { service, asyncRequest } = createService({
			project: "p",
			location: "l",
		});
		asyncRequest
			.mockResolvedValueOnce({
				name: "projects/p/locations/l/reasoningEngines/42/sessions/s1/operations/op",
			})
			.mockResolvedValueOnce({ done: true })
			.mockResolvedValueOnce({
				name: "projects/p/locations/l/reasoningEngines/42/sessions/s1",
				updateTime: "2024-02-01T00:00:00.000Z",
			});

		const session = await service.createSession("42", "u");

		expect(asyncRequest.mock.calls[0][0].path).toBe(
			"reasoningEngines/42/sessions",
		);
		expect(asyncRequest.mock.calls[0][0].request_dict).toEqual({
			user_id: "u",
		});
		expect(session.state).toEqual({});
		expect(session.id).toBe("s1");
	});

	it("createSession extracts reasoning engine id from full resource app names", async () => {
		const { service, asyncRequest } = createService({
			project: "p",
			location: "l",
		});
		asyncRequest
			.mockResolvedValueOnce({
				name: "projects/p/locations/l/reasoningEngines/777/sessions/x/operations/o",
			})
			.mockResolvedValueOnce({ done: true })
			.mockResolvedValueOnce({
				name: "projects/p/locations/l/reasoningEngines/777/sessions/x",
				updateTime: "2024-03-01T00:00:00.000Z",
			});

		await service.createSession(
			"projects/my-proj/locations/us-central1/reasoningEngines/777",
			"u",
		);

		expect(asyncRequest.mock.calls[0][0].path).toBe(
			"reasoningEngines/777/sessions",
		);
	});

	it("createSession rejects invalid non-numeric app names without agentEngineId", async () => {
		const { service } = createService({
			project: "p",
			location: "l",
		});
		await expect(service.createSession("not-valid", "u")).rejects.toThrow(
			/not valid/,
		);
	});

	it("createSession times out when the LRO never completes", async () => {
		vi.useFakeTimers();
		const { service, asyncRequest } = createService({ agentEngineId: "1" });
		asyncRequest
			.mockResolvedValueOnce({
				name: "projects/p/locations/l/reasoningEngines/1/sessions/s/operations/slow",
			})
			.mockResolvedValue({ done: false });

		const pending = service.createSession("app", "u");
		const assertion = expect(pending).rejects.toThrow(
			/Timeout waiting for operation slow/,
		);
		await vi.runAllTimersAsync();
		await assertion;
	});

	it("getSession returns undefined when the API throws", async () => {
		const { service, asyncRequest } = createService();
		asyncRequest.mockRejectedValueOnce(new Error("not found"));
		await expect(
			service.getSession("app", "u", "missing"),
		).resolves.toBeUndefined();
	});

	it("getSession returns early when events response only has httpHeaders", async () => {
		const { service, asyncRequest } = createService();
		asyncRequest
			.mockResolvedValueOnce({
				name: "projects/p/locations/l/reasoningEngines/9/sessions/sess-1",
				updateTime: "2024-01-01T00:00:00.000Z",
				sessionState: { a: 1 },
			})
			.mockResolvedValueOnce({ httpHeaders: { "x-empty": "1" } });

		const session = await service.getSession("app", "u", "sess-1");

		expect(session).toMatchObject({
			id: "sess-1",
			state: { a: 1 },
			events: [],
		});
	});

	it("getSession maps events, paginates, filters by update time, and applies numRecentEvents", async () => {
		const { service, asyncRequest } = createService();
		const updateTime = "2024-01-01T00:00:10.000Z";
		const updateTs = Date.parse(updateTime) / 1000;

		asyncRequest
			.mockResolvedValueOnce({
				name: "projects/p/locations/l/reasoningEngines/9/sessions/sess-1",
				updateTime,
				sessionState: {},
			})
			.mockResolvedValueOnce({
				sessionEvents: [
					{
						name: "projects/p/locations/l/reasoningEngines/9/sessions/sess-1/events/e1",
						invocationId: "inv-1",
						author: "user",
						timestamp: "2024-01-01T00:00:01.000Z",
						content: { parts: [{ text: "hi" }] },
						actions: {
							skipSummarization: true,
							stateDelta: { k: "v" },
							artifactDelta: { f: 1 },
							transferAgent: "other",
							escalate: false,
							requestedAuthConfigs: { a: 1 },
						},
						errorCode: "E",
						errorMessage: "oops",
						eventMetadata: {
							partial: false,
							turnComplete: true,
							interrupted: false,
							branch: "root.child",
							longRunningToolIds: ["tool-1"],
							groundingMetadata: { chunks: [] },
						},
					},
				],
				nextPageToken: "page-2",
			})
			.mockResolvedValueOnce({
				sessionEvents: [
					{
						name: "projects/p/locations/l/reasoningEngines/9/sessions/sess-1/events/e2",
						invocationId: "inv-2",
						author: "agent",
						timestamp: "2024-01-01T00:00:05.000Z",
						content: { parts: [{ text: "yo" }] },
					},
					{
						name: "projects/p/locations/l/reasoningEngines/9/sessions/sess-1/events/e3",
						invocationId: "inv-3",
						author: "agent",
						timestamp: "2024-01-01T00:00:20.000Z",
						content: { parts: [{ text: "too late" }] },
					},
				],
			});

		const session = await service.getSession("app", "u", "sess-1", {
			numRecentEvents: 1,
		});

		expect(asyncRequest.mock.calls[2][0].path).toContain("pageToken=page-2");
		expect(session?.events).toHaveLength(1);
		expect(session?.events[0].author).toBe("agent");
		expect(session?.events[0].timestamp).toBeLessThanOrEqual(updateTs);
		expect(session?.lastUpdateTime).toBe(updateTs);
	});

	it("getSession applies afterTimestamp when numRecentEvents is absent", async () => {
		const { service, asyncRequest } = createService();
		const updateTime = "2024-01-01T00:00:10.000Z";
		asyncRequest
			.mockResolvedValueOnce({
				name: "projects/p/locations/l/reasoningEngines/9/sessions/sess-1",
				updateTime,
				sessionState: {},
			})
			.mockResolvedValueOnce({
				sessionEvents: [
					{
						name: ".../events/e0",
						invocationId: "i0",
						author: "user",
						timestamp: "2024-01-01T00:00:01.000Z",
						content: { parts: [{ text: "old" }] },
					},
					{
						name: ".../events/e1",
						invocationId: "i1",
						author: "user",
						timestamp: "2024-01-01T00:00:06.000Z",
						content: { parts: [{ text: "new" }] },
					},
				],
			});

		const session = await service.getSession("app", "u", "sess-1", {
			afterTimestamp: Date.parse("2024-01-01T00:00:05.000Z") / 1000,
		});

		expect(session?.events.map((e) => e.author)).toEqual(["user", "user"]);
		expect(session?.events[0].content?.parts?.[0]).toEqual({ text: "old" });
	});

	it("listSessions returns empty when response has httpHeaders", async () => {
		const { service, asyncRequest } = createService();
		asyncRequest.mockResolvedValueOnce({ httpHeaders: {} });
		await expect(service.listSessions("app", "alice")).resolves.toEqual({
			sessions: [],
		});
		expect(asyncRequest.mock.calls[0][0].path).toContain(
			"filter=user_id=%22alice%22",
		);
	});

	it("listSessions maps API sessions", async () => {
		const { service, asyncRequest } = createService();
		asyncRequest.mockResolvedValueOnce({
			sessions: [
				{
					name: "projects/p/locations/l/reasoningEngines/9/sessions/a",
					updateTime: "2024-01-01T00:00:00.000Z",
				},
				{
					name: "projects/p/locations/l/reasoningEngines/9/sessions/b",
					updateTime: "2024-01-02T00:00:00.000Z",
				},
			],
		});

		const { sessions } = await service.listSessions("app", "u");

		expect(sessions).toHaveLength(2);
		expect(sessions[0]).toMatchObject({
			appName: "app",
			userId: "u",
			id: "a",
			events: [],
			state: {},
		});
		expect(sessions[1].id).toBe("b");
	});

	it("deleteSession forwards DELETE and rethrows API errors", async () => {
		const { service, asyncRequest } = createService();
		asyncRequest.mockResolvedValueOnce({});
		await service.deleteSession("app", "u", "sess");
		expect(asyncRequest).toHaveBeenCalledWith({
			http_method: "DELETE",
			path: "reasoningEngines/9/sessions/sess",
			request_dict: {},
		});

		asyncRequest.mockRejectedValueOnce(new Error("denied"));
		await expect(service.deleteSession("app", "u", "sess")).rejects.toThrow(
			"denied",
		);
	});

	it("appendEvent updates local session state and posts convertEventToJson payload", async () => {
		const { service, asyncRequest } = createService();
		asyncRequest.mockResolvedValueOnce({});
		const session = {
			id: "sess",
			appName: "app",
			userId: "u",
			state: { keep: 1 },
			events: [] as Event[],
			lastUpdateTime: 0,
		};
		const event = new Event({
			author: "agent",
			invocationId: "inv",
			timestamp: 12.75,
			content: { parts: [{ text: "hello" }] },
			actions: new EventActions({
				skipSummarization: true,
				stateDelta: { keep: 2, temp_skip: "x" },
				artifactDelta: { file: 3 },
				transferToAgent: "child",
				escalate: true,
				requestedAuthConfigs: { auth: true },
			}),
			longRunningToolIds: new Set(["lr-1"]),
			branch: "root",
			partial: false,
		});
		event.errorCode = "EC";
		event.errorMessage = "msg";
		event.interrupted = true;
		event.turnComplete = true;
		event.groundingMetadata = { webSearchQueries: ["q"] } as any;

		const returned = await service.appendEvent(session, event);

		expect(returned).toBe(event);
		expect(session.state).toEqual({ keep: 2 });
		expect(session.events).toHaveLength(1);
		expect(asyncRequest).toHaveBeenCalledWith({
			http_method: "POST",
			path: "reasoningEngines/9/sessions/sess:appendEvent",
			request_dict: expect.objectContaining({
				author: "agent",
				invocation_id: "inv",
				timestamp: { seconds: 12, nanos: 750_000_000 },
				error_code: "EC",
				error_message: "msg",
				content: { parts: [{ text: "hello" }] },
				actions: expect.objectContaining({
					skip_summarization: true,
					state_delta: { keep: 2, temp_skip: "x" },
					transfer_agent: "child",
					escalate: true,
				}),
				event_metadata: expect.objectContaining({
					branch: "root",
					long_running_tool_ids: ["lr-1"],
					grounding_metadata: { webSearchQueries: ["q"] },
				}),
			}),
		});
	});

	it("appendEvent still posts partial events while leaving local history unchanged", async () => {
		const { service, asyncRequest } = createService();
		asyncRequest.mockResolvedValueOnce({});
		const session = {
			id: "sess",
			appName: "app",
			userId: "u",
			state: {},
			events: [] as Event[],
			lastUpdateTime: 0,
		};
		const partial = new Event({
			author: "agent",
			partial: true,
			content: { parts: [{ text: "..." }] },
		});

		const returned = await service.appendEvent(session, partial);
		expect(returned).toBe(partial);
		expect(session.events).toHaveLength(0);
		expect(asyncRequest).toHaveBeenCalledWith(
			expect.objectContaining({
				http_method: "POST",
				path: "reasoningEngines/9/sessions/sess:appendEvent",
			}),
		);
	});

	it("createSession succeeds when LRO completes on a later poll", async () => {
		vi.useFakeTimers();
		const { service, asyncRequest } = createService({ agentEngineId: "1" });
		asyncRequest
			.mockResolvedValueOnce({
				name: "projects/p/locations/l/reasoningEngines/1/sessions/s/operations/op",
			})
			.mockResolvedValueOnce({ done: false })
			.mockResolvedValueOnce({ done: true })
			.mockResolvedValueOnce({
				name: "projects/p/locations/l/reasoningEngines/1/sessions/s",
				updateTime: "2024-01-01T00:00:00.000Z",
				sessionState: { ready: true },
			});

		const pending = service.createSession("app", "u");
		await vi.advanceTimersByTimeAsync(1000);
		const session = await pending;
		expect(session.state).toEqual({ ready: true });
		expect(asyncRequest).toHaveBeenCalledTimes(4);
	});

	it("createSession with empty state object still sends session_state", async () => {
		const { service, asyncRequest } = createService({ agentEngineId: "3" });
		asyncRequest
			.mockResolvedValueOnce({
				name: "projects/p/locations/l/reasoningEngines/3/sessions/s/operations/o",
			})
			.mockResolvedValueOnce({ done: true })
			.mockResolvedValueOnce({
				name: "projects/p/locations/l/reasoningEngines/3/sessions/s",
				updateTime: "2024-01-01T00:00:00.000Z",
			});

		await service.createSession("app", "u", {});
		expect(asyncRequest.mock.calls[0][0].request_dict).toEqual({
			user_id: "u",
			session_state: {},
		});
	});

	it("prefers agentEngineId over numeric or resource app names", async () => {
		const { service, asyncRequest } = createService({
			agentEngineId: "engine-override",
		});
		asyncRequest
			.mockResolvedValueOnce({
				name: "projects/p/locations/l/reasoningEngines/engine-override/sessions/s/operations/o",
			})
			.mockResolvedValueOnce({ done: true })
			.mockResolvedValueOnce({
				name: "projects/p/locations/l/reasoningEngines/engine-override/sessions/s",
				updateTime: "2024-01-01T00:00:00.000Z",
			});

		await service.createSession(
			"projects/p/locations/l/reasoningEngines/999",
			"u",
		);
		expect(asyncRequest.mock.calls[0][0].path).toBe(
			"reasoningEngines/engine-override/sessions",
		);
	});

	it("listSessions omits user filter when userId is empty", async () => {
		const { service, asyncRequest } = createService();
		asyncRequest.mockResolvedValueOnce({ sessions: [] });
		await service.listSessions("app", "");
		expect(asyncRequest.mock.calls[0][0].path).toBe(
			"reasoningEngines/9/sessions",
		);
	});

	it("listSessions returns empty when sessions field is absent", async () => {
		const { service, asyncRequest } = createService();
		asyncRequest.mockResolvedValueOnce({});
		await expect(service.listSessions("app", "u")).resolves.toEqual({
			sessions: [],
		});
	});

	it("getSession keeps all events when every timestamp is after the cutoff", async () => {
		const { service, asyncRequest } = createService();
		asyncRequest
			.mockResolvedValueOnce({
				name: "projects/p/locations/l/reasoningEngines/9/sessions/sess",
				updateTime: "2024-01-01T00:00:10.000Z",
				sessionState: {},
			})
			.mockResolvedValueOnce({
				sessionEvents: [
					{
						name: ".../e1",
						invocationId: "i1",
						author: "user",
						timestamp: "2024-01-01T00:00:06.000Z",
						content: { parts: [{ text: "a" }] },
					},
					{
						name: ".../e2",
						invocationId: "i2",
						author: "agent",
						timestamp: "2024-01-01T00:00:08.000Z",
						content: { parts: [{ text: "b" }] },
					},
				],
			});

		const session = await service.getSession("app", "u", "sess", {
			afterTimestamp: Date.parse("2024-01-01T00:00:01.000Z") / 1000,
		});
		expect(session?.events.map((e) => e.content?.parts?.[0]?.text)).toEqual([
			"a",
			"b",
		]);
	});

	it("getSession with empty config leaves events unfiltered beyond timestamp", async () => {
		const { service, asyncRequest } = createService();
		asyncRequest
			.mockResolvedValueOnce({
				name: "projects/p/locations/l/reasoningEngines/9/sessions/sess",
				updateTime: "2024-01-01T00:00:10.000Z",
				sessionState: { z: 1 },
			})
			.mockResolvedValueOnce({
				sessionEvents: [
					{
						name: ".../e1",
						invocationId: "i1",
						author: "user",
						timestamp: "2024-01-01T00:00:05.000Z",
						content: { parts: [{ text: "kept" }] },
					},
					{
						name: ".../e2",
						invocationId: "i2",
						author: "agent",
						timestamp: "2024-01-01T00:00:20.000Z",
						content: { parts: [{ text: "dropped-late" }] },
					},
				],
			});

		const session = await service.getSession("app", "u", "sess", {});
		expect(session?.events).toHaveLength(1);
		expect(session?.events[0].content?.parts?.[0]?.text).toBe("kept");
		expect(session?.state).toEqual({ z: 1 });
	});

	it("getSession pagination pages without sessionEvents are skipped", async () => {
		const { service, asyncRequest } = createService();
		asyncRequest
			.mockResolvedValueOnce({
				name: "projects/p/locations/l/reasoningEngines/9/sessions/sess",
				updateTime: "2024-01-01T00:00:10.000Z",
			})
			.mockResolvedValueOnce({
				sessionEvents: [
					{
						name: ".../e1",
						invocationId: "i1",
						author: "user",
						timestamp: "2024-01-01T00:00:01.000Z",
						content: { parts: [{ text: "one" }] },
					},
				],
				nextPageToken: "tok&special",
			})
			.mockResolvedValueOnce({ nextPageToken: undefined });

		const session = await service.getSession("app", "u", "sess");
		expect(asyncRequest.mock.calls[2][0].path).toContain(
			`pageToken=${encodeURIComponent("tok&special")}`,
		);
		expect(session?.events).toHaveLength(1);
	});

	it("fromApiEvent maps minimal events and decode helpers", () => {
		const { service } = createService();
		const event = (service as any).fromApiEvent({
			name: "projects/p/locations/l/reasoningEngines/9/sessions/s/events/eid",
			invocationId: "inv",
			author: "agent",
			timestamp: "2024-01-01T00:00:00.000Z",
		});
		expect(event.id).toBe("eid");
		expect(event.actions).toBeInstanceOf(EventActions);
		expect(event.content).toBeUndefined();
		expect(event.errorCode).toBeUndefined();
		expect(event.groundingMetadata).toBeUndefined();

		expect((service as any).decodeContent(undefined)).toBeUndefined();
		expect((service as any).decodeContent({ role: "user" })).toEqual({
			role: "user",
		});
		expect((service as any).decodeGroundingMetadata(null)).toBeUndefined();
		expect((service as any).decodeGroundingMetadata({ x: 1 })).toEqual({
			x: 1,
		});
	});

	it("fromApiEvent sets error fields and omits empty longRunningToolIds", () => {
		const { service } = createService();
		const event = (service as any).fromApiEvent({
			name: ".../events/e",
			invocationId: "inv",
			author: "agent",
			timestamp: "2024-01-01T00:00:00.000Z",
			errorCode: "E1",
			errorMessage: "failed",
			eventMetadata: {
				partial: true,
				turnComplete: false,
				interrupted: true,
				branch: "b",
				longRunningToolIds: null,
				groundingMetadata: null,
			},
		});
		expect(event.errorCode).toBe("E1");
		expect(event.errorMessage).toBe("failed");
		expect(event.partial).toBe(true);
		expect(event.interrupted).toBe(true);
		expect(event.longRunningToolIds).toBeUndefined();
		expect(event.groundingMetadata).toBeUndefined();
	});

	it("convertEventToJson serializes default actions and nulls tool ids when absent", () => {
		const { service } = createService();
		const payload = (service as any).convertEventToJson(
			new Event({
				author: "agent",
				invocationId: "inv",
				timestamp: 10,
			}),
		);
		expect(payload.actions).toMatchObject({
			state_delta: {},
			artifact_delta: {},
		});
		expect(payload.content).toBeUndefined();
		expect(payload.event_metadata.long_running_tool_ids).toBeNull();
		expect(payload.event_metadata.grounding_metadata).toBeUndefined();
		expect(payload.timestamp).toEqual({ seconds: 10, nanos: 0 });
	});

	it("appendEvent posts minimal convertEventToJson with default action bag", async () => {
		const { service, asyncRequest } = createService();
		asyncRequest.mockResolvedValueOnce({});
		const session = {
			id: "sess",
			appName: "app",
			userId: "u",
			state: {},
			events: [] as Event[],
			lastUpdateTime: 0,
		};
		const event = new Event({
			author: "user",
			invocationId: "inv-min",
			timestamp: 3.25,
			content: { parts: [{ text: "hi" }] },
		});
		await service.appendEvent(session, event);
		expect(asyncRequest.mock.calls[0][0].request_dict).toEqual(
			expect.objectContaining({
				author: "user",
				invocation_id: "inv-min",
				timestamp: { seconds: 3, nanos: 250_000_000 },
				content: { parts: [{ text: "hi" }] },
				actions: expect.objectContaining({
					state_delta: {},
					artifact_delta: {},
				}),
			}),
		);
		expect(session.events).toHaveLength(1);
	});

	it("getSession logs and returns undefined when events listing throws", async () => {
		const errorSpy = vi.spyOn(console, "error");
		const { service, asyncRequest } = createService();
		asyncRequest
			.mockResolvedValueOnce({
				name: "projects/p/locations/l/reasoningEngines/9/sessions/sess",
				updateTime: "2024-01-01T00:00:00.000Z",
			})
			.mockRejectedValueOnce(new Error("events boom"));

		await expect(
			service.getSession("app", "u", "sess"),
		).resolves.toBeUndefined();
		expect(errorSpy).toHaveBeenCalledWith(
			"Error getting session sess:",
			expect.any(Error),
		);
	});

	it("getReasoningEngineId rejects malformed resource names", () => {
		const { service } = createService({ project: "p", location: "l" });
		expect(() =>
			(service as any).getReasoningEngineId(
				"projects/p/locations/l/reasoningEngines/not-digits",
			),
		).toThrow(/not valid/);
		expect((service as any).getReasoningEngineId("4242")).toBe("4242");
	});

	it("keeps events whose timestamp equals the session update time", async () => {
		const { service, asyncRequest } = createService();
		const updateTime = "2024-01-01T00:00:10.000Z";
		asyncRequest
			.mockResolvedValueOnce({
				name: "projects/p/locations/l/reasoningEngines/9/sessions/sess",
				updateTime,
			})
			.mockResolvedValueOnce({
				sessionEvents: [
					{
						name: ".../e",
						invocationId: "i",
						author: "agent",
						timestamp: updateTime,
						content: { parts: [{ text: "boundary" }] },
					},
				],
			});

		const session = await service.getSession("app", "u", "sess");
		expect(session?.events).toHaveLength(1);
		expect(session?.events[0].content?.parts?.[0]?.text).toBe("boundary");
	});

	it("getApiClient constructs a Vertex GoogleGenAI client", () => {
		const service = new VertexAiSessionService({
			project: "proj-x",
			location: "us-east1",
			agentEngineId: "1",
		});
		const apiClient = { async_request: vi.fn() };
		const GoogleGenAI = vi.fn(() => ({ _api_client: apiClient }));

		const Module = require("node:module");
		const original = Module.prototype.require;
		Module.prototype.require = function (id: string, ...rest: unknown[]) {
			if (id === "@google/genai") {
				return { GoogleGenAI };
			}
			return original.apply(this, [id, ...rest] as [string]);
		};

		try {
			const client = (service as any).getApiClient();
			expect(GoogleGenAI).toHaveBeenCalledWith({
				vertexai: true,
				project: "proj-x",
				location: "us-east1",
			});
			expect(client).toBe(apiClient);
		} finally {
			Module.prototype.require = original;
		}
	});
});
