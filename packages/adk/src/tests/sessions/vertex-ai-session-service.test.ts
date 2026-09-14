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

	it("appendEvent keeps local mutations when the remote POST rejects", async () => {
		const { service, asyncRequest } = createService();
		asyncRequest.mockRejectedValueOnce(new Error("remote-down"));
		const session = {
			id: "sess-local",
			appName: "app",
			userId: "u",
			state: { keep: 1 },
			events: [] as Event[],
			lastUpdateTime: 0,
		};
		const event = new Event({
			author: "agent",
			content: { parts: [{ text: "local-first" }] },
			actions: new EventActions({
				stateDelta: { keep: 9, local: "yes" },
			}),
		});

		await expect(service.appendEvent(session, event)).rejects.toThrow(
			"remote-down",
		);
		expect(session.state).toEqual({ keep: 9, local: "yes" });
		expect(session.events).toHaveLength(1);
		expect(session.events[0].content?.parts?.[0]?.text).toBe("local-first");
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

	it("createSession polls until LRO completes after intermediate done:false responses", async () => {
		vi.useFakeTimers();
		const { service, asyncRequest } = createService({ agentEngineId: "55" });
		asyncRequest
			.mockResolvedValueOnce({
				name: "projects/p/locations/l/reasoningEngines/55/sessions/sess-poll/operations/op-poll",
			})
			.mockResolvedValueOnce({ done: false })
			.mockResolvedValueOnce({ done: false })
			.mockResolvedValueOnce({ done: true })
			.mockResolvedValueOnce({
				name: "projects/p/locations/l/reasoningEngines/55/sessions/sess-poll",
				updateTime: "2024-04-01T00:00:00.000Z",
				sessionState: { polled: true },
			});

		const pending = service.createSession("app", "user-poll", { seed: 1 });
		await vi.advanceTimersByTimeAsync(1000);
		await vi.advanceTimersByTimeAsync(1000);
		const session = await pending;

		expect(asyncRequest).toHaveBeenCalledTimes(5);
		expect(session).toMatchObject({
			id: "sess-poll",
			state: { polled: true },
		});
	});

	it("listSessions omits user_id filter when userId is empty", async () => {
		const { service, asyncRequest } = createService();
		asyncRequest.mockResolvedValueOnce({ sessions: [] });

		await service.listSessions("app", "");

		expect(asyncRequest).toHaveBeenCalledWith({
			http_method: "GET",
			path: "reasoningEngines/9/sessions",
			request_dict: {},
		});
	});

	it("listSessions returns empty when response has neither httpHeaders nor sessions", async () => {
		const { service, asyncRequest } = createService();
		asyncRequest.mockResolvedValueOnce({});

		await expect(service.listSessions("app", "u")).resolves.toEqual({
			sessions: [],
		});
	});

	it("getSession returns empty events when response has neither httpHeaders nor sessionEvents", async () => {
		const { service, asyncRequest } = createService();
		asyncRequest
			.mockResolvedValueOnce({
				name: "projects/p/locations/l/reasoningEngines/9/sessions/sess-empty",
				updateTime: "2024-01-01T00:00:00.000Z",
				sessionState: {},
			})
			.mockResolvedValueOnce({});

		const session = await service.getSession("app", "u", "sess-empty");
		expect(session?.events).toEqual([]);
		expect(session?.id).toBe("sess-empty");
	});

	it("getSession pagination page with nextPageToken but no sessionEvents is tolerated", async () => {
		const { service, asyncRequest } = createService();
		asyncRequest
			.mockResolvedValueOnce({
				name: "projects/p/locations/l/reasoningEngines/9/sessions/sess-page",
				updateTime: "2024-01-01T00:00:10.000Z",
				sessionState: {},
			})
			.mockResolvedValueOnce({
				sessionEvents: [
					{
						name: ".../events/e1",
						invocationId: "i1",
						author: "user",
						timestamp: "2024-01-01T00:00:01.000Z",
						content: { parts: [{ text: "first" }] },
					},
				],
				nextPageToken: "tok-2",
			})
			.mockResolvedValueOnce({
				nextPageToken: undefined,
			});

		const session = await service.getSession("app", "u", "sess-page");
		expect(session?.events).toHaveLength(1);
		expect(session?.events[0].content?.parts?.[0]).toEqual({ text: "first" });
	});

	it("getSession afterTimestamp keeps all events when none are older than the threshold", async () => {
		const { service, asyncRequest } = createService();
		asyncRequest
			.mockResolvedValueOnce({
				name: "projects/p/locations/l/reasoningEngines/9/sessions/sess-at",
				updateTime: "2024-01-01T00:00:10.000Z",
				sessionState: {},
			})
			.mockResolvedValueOnce({
				sessionEvents: [
					{
						name: ".../events/e1",
						invocationId: "i1",
						author: "user",
						timestamp: "2024-01-01T00:00:06.000Z",
						content: { parts: [{ text: "a" }] },
					},
					{
						name: ".../events/e2",
						invocationId: "i2",
						author: "agent",
						timestamp: "2024-01-01T00:00:08.000Z",
						content: { parts: [{ text: "b" }] },
					},
				],
			});

		const session = await service.getSession("app", "u", "sess-at", {
			afterTimestamp: Date.parse("2024-01-01T00:00:01.000Z") / 1000,
		});

		expect(session?.events.map((e) => e.content?.parts?.[0]?.text)).toEqual([
			"a",
			"b",
		]);
	});

	it("fromApiEvent maps minimal events without actions, metadata, or errors", () => {
		const { service } = createService();
		const event = (service as any).fromApiEvent({
			name: "projects/p/locations/l/reasoningEngines/9/sessions/s/events/min-1",
			invocationId: "inv-min",
			author: "user",
			timestamp: "2024-01-01T00:00:00.000Z",
			content: { parts: [{ text: "plain" }] },
		});

		expect(event.id).toBe("min-1");
		expect(event.invocationId).toBe("inv-min");
		expect(event.author).toBe("user");
		expect(event.content).toEqual({ parts: [{ text: "plain" }] });
		expect(event.errorCode).toBeUndefined();
		expect(event.errorMessage).toBeUndefined();
		expect(event.partial).toBeUndefined();
		expect(event.longRunningToolIds).toBeUndefined();
		expect(event.actions).toBeInstanceOf(EventActions);
	});

	it("fromApiEvent treats null longRunningToolIds as undefined", () => {
		const { service } = createService();
		const event = (service as any).fromApiEvent({
			name: ".../events/null-lr",
			invocationId: "inv",
			author: "agent",
			timestamp: "2024-01-01T00:00:00.000Z",
			eventMetadata: {
				partial: true,
				turnComplete: false,
				interrupted: false,
				branch: "main",
				longRunningToolIds: null,
			},
		});

		expect(event.partial).toBe(true);
		expect(event.branch).toBe("main");
		expect(event.longRunningToolIds).toBeUndefined();
	});

	it("decodeContent and decodeGroundingMetadata return undefined for falsy input", () => {
		const { service } = createService();
		expect((service as any).decodeContent(undefined)).toBeUndefined();
		expect((service as any).decodeContent(null)).toBeUndefined();
		expect((service as any).decodeContent(false)).toBeUndefined();
		expect((service as any).decodeContent({ parts: [] })).toEqual({
			parts: [],
		});

		expect((service as any).decodeGroundingMetadata(undefined)).toBeUndefined();
		expect((service as any).decodeGroundingMetadata(null)).toBeUndefined();
		expect((service as any).decodeGroundingMetadata(0)).toBeUndefined();
		expect((service as any).decodeGroundingMetadata({ chunks: [1] })).toEqual({
			chunks: [1],
		});
	});

	it("convertEventToJson serializes default EventActions for minimal events", () => {
		const { service } = createService();
		const minimal = new Event({
			author: "agent",
			invocationId: "inv-min",
			timestamp: 42,
		});
		const payload = (service as any).convertEventToJson(minimal);

		expect(payload.author).toBe("agent");
		expect(payload.invocation_id).toBe("inv-min");
		expect(payload.timestamp).toEqual({ seconds: 42, nanos: 0 });
		expect(payload.event_metadata.long_running_tool_ids).toBeNull();
		expect(payload.actions).toEqual({
			skip_summarization: undefined,
			state_delta: {},
			artifact_delta: {},
			transfer_agent: undefined,
			escalate: undefined,
			requested_auth_configs: undefined,
		});
		expect(payload.content).toBeUndefined();
	});

	it("convertEventToJson omits grounding_metadata when absent", () => {
		const { service } = createService();
		const event = new Event({
			author: "user",
			timestamp: 1.5,
			longRunningToolIds: new Set(["a", "b"]),
			content: { parts: [{ text: "hi" }] },
		});
		const payload = (service as any).convertEventToJson(event);
		expect(payload.event_metadata.long_running_tool_ids).toEqual(["a", "b"]);
		expect(payload.event_metadata.grounding_metadata).toBeUndefined();
		expect(payload.content).toEqual({ parts: [{ text: "hi" }] });
		expect(payload.timestamp).toEqual({
			seconds: 1,
			nanos: 500_000_000,
		});
	});

	it("appendEvent posts default actions and omits content when content is absent", async () => {
		const { service, asyncRequest } = createService();
		asyncRequest.mockResolvedValueOnce({});
		const session = {
			id: "sess-bare",
			appName: "app",
			userId: "u",
			state: {},
			events: [] as Event[],
			lastUpdateTime: 0,
		};
		const event = new Event({
			author: "agent",
			invocationId: "inv-bare",
			timestamp: 10,
		});

		await service.appendEvent(session, event);

		expect(asyncRequest).toHaveBeenCalledWith({
			http_method: "POST",
			path: "reasoningEngines/9/sessions/sess-bare:appendEvent",
			request_dict: expect.objectContaining({
				author: "agent",
				invocation_id: "inv-bare",
				timestamp: { seconds: 10, nanos: 0 },
				actions: expect.objectContaining({
					state_delta: {},
					artifact_delta: {},
				}),
			}),
		});
		const body = asyncRequest.mock.calls[0][0].request_dict;
		expect(body.content).toBeUndefined();
		expect(session.events).toHaveLength(1);
	});

	it("getApiClient constructs GoogleGenAI with vertex options", () => {
		const Module = require("node:module") as typeof import("node:module");
		const originalRequire = Module.prototype.require;
		const asyncRequest = vi.fn();
		const GoogleGenAI = vi.fn().mockImplementation(() => ({
			_api_client: { async_request: asyncRequest },
		}));

		Module.prototype.require = function (
			this: NodeModule,
			id: string,
			...rest: unknown[]
		) {
			if (id === "@google/genai") {
				return { GoogleGenAI };
			}
			return originalRequire.apply(this, [id, ...rest] as [string]);
		} as typeof Module.prototype.require;

		try {
			const service = new VertexAiSessionService({
				project: "proj-x",
				location: "europe-west1",
				agentEngineId: "1",
			});
			const client = (service as any).getApiClient();
			expect(GoogleGenAI).toHaveBeenCalledWith({
				vertexai: true,
				project: "proj-x",
				location: "europe-west1",
			});
			expect(client.async_request).toBe(asyncRequest);
		} finally {
			Module.prototype.require = originalRequire;
		}
	});

	it("filters out events newer than session updateTime before applying config", async () => {
		const { service, asyncRequest } = createService();
		asyncRequest
			.mockResolvedValueOnce({
				name: "projects/p/locations/l/reasoningEngines/9/sessions/sess-filter",
				updateTime: "2024-01-01T00:00:05.000Z",
				sessionState: {},
			})
			.mockResolvedValueOnce({
				sessionEvents: [
					{
						name: ".../events/old",
						invocationId: "i0",
						author: "user",
						timestamp: "2024-01-01T00:00:01.000Z",
						content: { parts: [{ text: "keep" }] },
					},
					{
						name: ".../events/future",
						invocationId: "i1",
						author: "agent",
						timestamp: "2024-01-01T00:00:09.000Z",
						content: { parts: [{ text: "drop" }] },
					},
				],
			});

		const session = await service.getSession("app", "u", "sess-filter");
		expect(session?.events.map((e) => e.content?.parts?.[0]?.text)).toEqual([
			"keep",
		]);
	});

	it("getSession sorts events by ascending timestamp across pages", async () => {
		const { service, asyncRequest } = createService();
		asyncRequest
			.mockResolvedValueOnce({
				name: "projects/p/locations/l/reasoningEngines/9/sessions/sess-sort",
				updateTime: "2024-01-01T00:00:30.000Z",
				sessionState: {},
			})
			.mockResolvedValueOnce({
				sessionEvents: [
					{
						name: ".../events/e2",
						invocationId: "i2",
						author: "agent",
						timestamp: "2024-01-01T00:00:20.000Z",
						content: { parts: [{ text: "second" }] },
					},
				],
				nextPageToken: "p2",
			})
			.mockResolvedValueOnce({
				sessionEvents: [
					{
						name: ".../events/e1",
						invocationId: "i1",
						author: "user",
						timestamp: "2024-01-01T00:00:10.000Z",
						content: { parts: [{ text: "first" }] },
					},
				],
			});

		const session = await service.getSession("app", "u", "sess-sort");
		expect(session?.events.map((e) => e.content?.parts?.[0]?.text)).toEqual([
			"first",
			"second",
		]);
	});

	it("fromApiEvent applies empty defaults for missing action delta maps", () => {
		const { service } = createService();
		const event = (service as any).fromApiEvent({
			name: ".../events/act",
			invocationId: "inv",
			author: "agent",
			timestamp: "2024-01-01T00:00:00.000Z",
			actions: {
				skipSummarization: false,
				transferAgent: "child",
				escalate: true,
			},
			errorCode: "ERR",
			errorMessage: "failed",
		});

		expect(event.actions.stateDelta).toEqual({});
		expect(event.actions.artifactDelta).toEqual({});
		expect(event.actions.requestedAuthConfigs).toEqual({});
		expect(event.actions.transferToAgent).toBe("child");
		expect(event.actions.escalate).toBe(true);
		expect(event.errorCode).toBe("ERR");
		expect(event.errorMessage).toBe("failed");
	});

	it("ignores afterTimestamp when numRecentEvents is set (else-if)", async () => {
		const { service, asyncRequest } = createService();
		asyncRequest
			.mockResolvedValueOnce({
				name: "projects/p/locations/l/reasoningEngines/9/sessions/sess-elif",
				updateTime: "2024-01-01T00:00:30.000Z",
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
						author: "agent",
						timestamp: "2024-01-01T00:00:10.000Z",
						content: { parts: [{ text: "mid" }] },
					},
					{
						name: ".../events/e2",
						invocationId: "i2",
						author: "user",
						timestamp: "2024-01-01T00:00:20.000Z",
						content: { parts: [{ text: "new" }] },
					},
				],
			});

		const session = await service.getSession("app", "u", "sess-elif", {
			numRecentEvents: 2,
			afterTimestamp: Date.parse("2024-01-01T00:00:15.000Z") / 1000,
		});

		expect(session?.events.map((e) => e.content?.parts?.[0]?.text)).toEqual([
			"mid",
			"new",
		]);
	});

	it("afterTimestamp slice includes the first event with timestamp < threshold", async () => {
		const { service, asyncRequest } = createService();
		asyncRequest
			.mockResolvedValueOnce({
				name: "projects/p/locations/l/reasoningEngines/9/sessions/sess-slice",
				updateTime: "2024-01-01T00:00:30.000Z",
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
						author: "agent",
						timestamp: "2024-01-01T00:00:10.000Z",
						content: { parts: [{ text: "new" }] },
					},
				],
			});

		const session = await service.getSession("app", "u", "sess-slice", {
			afterTimestamp: Date.parse("2024-01-01T00:00:05.000Z") / 1000,
		});

		expect(session?.events.map((e) => e.content?.parts?.[0]?.text)).toEqual([
			"old",
			"new",
		]);
	});

	it("agentEngineId wins over numeric appName and full resource name", async () => {
		const { service, asyncRequest } = createService({
			agentEngineId: "engine-preferred",
		});
		asyncRequest.mockResolvedValueOnce({ httpHeaders: {} });

		await service.getSession(
			"projects/p/locations/l/reasoningEngines/99",
			"u",
			"sess",
		);
		expect(asyncRequest.mock.calls[0][0].path).toContain(
			"reasoningEngines/engine-preferred/sessions/sess",
		);

		asyncRequest.mockClear();
		asyncRequest.mockResolvedValueOnce({ httpHeaders: {} });
		await service.getSession("12345", "u", "sess");
		expect(asyncRequest.mock.calls[0][0].path).toContain(
			"reasoningEngines/engine-preferred/sessions/sess",
		);
	});

	it("paginates through multiple nextPageToken hops", async () => {
		const { service, asyncRequest } = createService();
		asyncRequest
			.mockResolvedValueOnce({
				name: "projects/p/locations/l/reasoningEngines/9/sessions/sess-pages",
				updateTime: "2024-01-01T00:01:00.000Z",
				sessionState: {},
			})
			.mockResolvedValueOnce({
				sessionEvents: [
					{
						name: ".../events/e1",
						invocationId: "i1",
						author: "user",
						timestamp: "2024-01-01T00:00:01.000Z",
						content: { parts: [{ text: "p1" }] },
					},
				],
				nextPageToken: "tok-a",
			})
			.mockResolvedValueOnce({
				sessionEvents: [
					{
						name: ".../events/e2",
						invocationId: "i2",
						author: "agent",
						timestamp: "2024-01-01T00:00:02.000Z",
						content: { parts: [{ text: "p2" }] },
					},
				],
				nextPageToken: "tok-b",
			})
			.mockResolvedValueOnce({
				sessionEvents: [
					{
						name: ".../events/e3",
						invocationId: "i3",
						author: "user",
						timestamp: "2024-01-01T00:00:03.000Z",
						content: { parts: [{ text: "p3" }] },
					},
				],
			});

		const session = await service.getSession("app", "u", "sess-pages");
		expect(session?.events.map((e) => e.content?.parts?.[0]?.text)).toEqual([
			"p1",
			"p2",
			"p3",
		]);
		expect(asyncRequest.mock.calls[2][0].path).toContain("pageToken=tok-a");
		expect(asyncRequest.mock.calls[3][0].path).toContain("pageToken=tok-b");
	});

	it("createSession times out when LRO responses stay null", async () => {
		vi.useFakeTimers();
		const { service, asyncRequest } = createService();
		asyncRequest.mockResolvedValueOnce({
			name: "projects/p/locations/l/reasoningEngines/9/sessions/sess-null/operations/op-null",
		});
		for (let i = 0; i < 6; i++) {
			asyncRequest.mockResolvedValueOnce(null);
		}

		const pending = service.createSession("app", "u");
		const assertion = expect(pending).rejects.toThrow(
			/Timeout waiting for operation op-null/,
		);
		await vi.runAllTimersAsync();
		await assertion;
	});

	it("fromApiEvent uses last path segment even for short names", () => {
		const { service } = createService();
		const event = (service as any).fromApiEvent({
			name: "short-id",
			invocationId: "inv",
			author: "agent",
			timestamp: "2024-01-01T00:00:00.000Z",
		});
		expect(event.id).toBe("short-id");
	});

	it("getSession returns undefined and logs when the API throws", async () => {
		const { service, asyncRequest } = createService();
		const error = vi
			.spyOn(console, "error")
			.mockImplementation(() => undefined);
		asyncRequest.mockRejectedValueOnce(new Error("boom"));

		await expect(
			service.getSession("app", "u", "missing"),
		).resolves.toBeUndefined();
		expect(error).toHaveBeenCalledWith(
			"Error getting session missing:",
			expect.any(Error),
		);
	});

	it("deleteSession rethrows API errors after logging", async () => {
		const { service, asyncRequest } = createService();
		const error = vi
			.spyOn(console, "error")
			.mockImplementation(() => undefined);
		asyncRequest.mockRejectedValueOnce(new Error("cannot delete"));

		await expect(service.deleteSession("app", "u", "sess")).rejects.toThrow(
			/cannot delete/,
		);
		expect(error).toHaveBeenCalledWith(
			"Error deleting session sess:",
			expect.any(Error),
		);
	});

	it("convertEventToJson includes grounding metadata and long-running tool ids", () => {
		const { service } = createService();
		const event = new Event({
			author: "agent",
			invocationId: "inv",
			timestamp: 12.5,
			partial: true,
			branch: "root",
			longRunningToolIds: new Set(["tool-a", "tool-b"]),
			content: { parts: [{ text: "hi" }] },
			actions: new EventActions({
				skipSummarization: true,
				stateDelta: { a: 1 },
				artifactDelta: { f: 0 },
				transferToAgent: "child",
				escalate: false,
				requestedAuthConfigs: { x: {} },
			}),
		});
		event.turnComplete = false;
		event.interrupted = true;
		event.groundingMetadata = { groundingChunks: [] } as any;
		event.errorCode = "E";
		event.errorMessage = "m";

		const json = (service as any).convertEventToJson(event);
		expect(json.timestamp).toEqual({
			seconds: 12,
			nanos: 500_000_000,
		});
		expect(json.event_metadata.long_running_tool_ids).toEqual(
			expect.arrayContaining(["tool-a", "tool-b"]),
		);
		expect(json.event_metadata.grounding_metadata).toEqual({
			groundingChunks: [],
		});
		expect(json.actions.transfer_agent).toBe("child");
		expect(json.content).toEqual({ parts: [{ text: "hi" }] });
		expect(json.error_code).toBe("E");
	});

	it("listSessions without userId omits the filter query", async () => {
		const { service, asyncRequest } = createService();
		asyncRequest.mockResolvedValueOnce({ sessions: [] });
		await service.listSessions("app", "");
		expect(asyncRequest.mock.calls[0][0].path).toBe(
			"reasoningEngines/9/sessions",
		);
	});

	it("getReasoningEngineId extracts id from full resource name", () => {
		const { service } = createService({ project: "p", location: "l" });
		expect(
			(service as any).getReasoningEngineId(
				"projects/p/locations/l/reasoningEngines/777",
			),
		).toBe("777");
	});

	it("appendEvent still mutates local session when the remote POST rejects", async () => {
		const { service, asyncRequest } = createService();
		asyncRequest.mockRejectedValueOnce(new Error("remote fail"));
		const session = {
			id: "sess-local",
			appName: "app",
			userId: "u",
			state: {},
			events: [] as Event[],
			lastUpdateTime: 0,
		};
		const event = new Event({
			author: "agent",
			invocationId: "inv",
			timestamp: 1,
			content: { parts: [{ text: "local" }] },
		});

		await expect(service.appendEvent(session, event)).rejects.toThrow(
			/remote fail/,
		);
		expect(session.events).toHaveLength(1);
	});
});
