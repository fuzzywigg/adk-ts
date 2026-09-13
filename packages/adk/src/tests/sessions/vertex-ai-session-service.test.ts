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
});
