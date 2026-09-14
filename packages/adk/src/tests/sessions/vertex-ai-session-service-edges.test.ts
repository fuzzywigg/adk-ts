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

describe("VertexAiSessionService leftover edges", () => {
	beforeEach(() => {
		vi.spyOn(console, "debug").mockImplementation(() => undefined);
		vi.spyOn(console, "error").mockImplementation(() => undefined);
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it("getReasoningEngineId prefers agentEngineId over numeric appName", () => {
		const { service } = createService({ agentEngineId: "engine-1" });
		expect((service as any).getReasoningEngineId("42")).toBe("engine-1");
		expect(
			(service as any).getReasoningEngineId(
				"projects/p/locations/l/reasoningEngines/99",
			),
		).toBe("engine-1");
	});

	it("getReasoningEngineId uses numeric appName when agentEngineId absent", () => {
		const { service } = createService({ project: "p", location: "l" });
		expect((service as any).getReasoningEngineId("12345")).toBe("12345");
	});

	it("getReasoningEngineId extracts id from full resource name", () => {
		const { service } = createService({ project: "p", location: "l" });
		expect(
			(service as any).getReasoningEngineId(
				"projects/my-proj/locations/us-central1/reasoningEngines/777",
			),
		).toBe("777");
	});

	it("getReasoningEngineId rejects invalid app names", () => {
		const { service } = createService({ project: "p", location: "l" });
		expect(() => (service as any).getReasoningEngineId("not-valid")).toThrow(
			/App name not-valid is not valid/,
		);
	});

	it("createSession times out when LRO never becomes done", async () => {
		vi.useFakeTimers();
		const { service, asyncRequest } = createService();
		asyncRequest.mockResolvedValueOnce({
			name: "projects/p/locations/l/reasoningEngines/9/sessions/s1/operations/op-timeout",
		});
		asyncRequest.mockResolvedValue({ done: false });

		const pending = service.createSession("app", "user");
		const expectation = expect(pending).rejects.toThrow(
			/Timeout waiting for operation op-timeout/,
		);

		for (let i = 0; i < 6; i++) {
			await vi.advanceTimersByTimeAsync(1000);
		}
		await expectation;
	});

	it("createSession times out when LRO responses are null", async () => {
		vi.useFakeTimers();
		const { service, asyncRequest } = createService();
		asyncRequest.mockResolvedValueOnce({
			name: "projects/p/locations/l/reasoningEngines/9/sessions/s2/operations/op-null",
		});
		asyncRequest.mockResolvedValue(null);

		const pending = service.createSession("app", "user");
		const expectation = expect(pending).rejects.toThrow(
			/Timeout waiting for operation op-null/,
		);
		for (let i = 0; i < 6; i++) {
			await vi.advanceTimersByTimeAsync(1000);
		}
		await expectation;
	});

	it("createSession treats undefined sessionState as empty object", async () => {
		const { service, asyncRequest } = createService();
		asyncRequest
			.mockResolvedValueOnce({
				name: "projects/p/locations/l/reasoningEngines/9/sessions/s3/operations/o",
			})
			.mockResolvedValueOnce({ done: true })
			.mockResolvedValueOnce({
				name: "projects/p/locations/l/reasoningEngines/9/sessions/s3",
				updateTime: "2024-01-01T00:00:00.000Z",
			});

		const session = await service.createSession("app", "u");
		expect(session.state).toEqual({});
		expect(session.id).toBe("s3");
	});

	it("convertEventToJson maps fractional nanos extremes", () => {
		const { service } = createService();
		const almostWhole = (service as any).convertEventToJson(
			new Event({
				author: "agent",
				timestamp: 10.999999999,
				invocationId: "inv",
			}),
		);
		expect(almostWhole.timestamp.seconds).toBe(10);
		expect(almostWhole.timestamp.nanos).toBeGreaterThan(0);
		expect(almostWhole.timestamp.nanos).toBeLessThanOrEqual(1_000_000_000);

		const exact = (service as any).convertEventToJson(
			new Event({ author: "agent", timestamp: 5, invocationId: "inv" }),
		);
		expect(exact.timestamp).toEqual({ seconds: 5, nanos: 0 });
	});

	it("convertEventToJson serializes empty longRunningToolIds Set as []", () => {
		const { service } = createService();
		const json = (service as any).convertEventToJson(
			new Event({
				author: "agent",
				timestamp: 1,
				longRunningToolIds: new Set(),
			}),
		);
		expect(json.event_metadata.long_running_tool_ids).toEqual([]);
	});

	it("convertEventToJson uses null long_running_tool_ids when Set absent", () => {
		const { service } = createService();
		const json = (service as any).convertEventToJson(
			new Event({ author: "agent", timestamp: 1 }),
		);
		expect(json.event_metadata.long_running_tool_ids).toBeNull();
	});

	it("convertEventToJson includes actions with undefined fields as-is", () => {
		const { service } = createService();
		const json = (service as any).convertEventToJson(
			new Event({
				author: "agent",
				timestamp: 1,
				actions: new EventActions({}),
			}),
		);
		expect(json.actions).toEqual({
			skip_summarization: undefined,
			state_delta: {},
			artifact_delta: {},
			transfer_agent: undefined,
			escalate: undefined,
			requested_auth_configs: undefined,
		});
	});

	it("convertEventToJson includes grounding metadata when present", () => {
		const { service } = createService();
		const event = new Event({
			author: "agent",
			timestamp: 1,
			content: { role: "model", parts: [{ text: "hi" }] },
		});
		event.groundingMetadata = { webSearchQueries: ["q"] } as any;
		const json = (service as any).convertEventToJson(event);
		expect(json.event_metadata.grounding_metadata).toEqual({
			webSearchQueries: ["q"],
		});
		expect(json.content).toEqual({ role: "model", parts: [{ text: "hi" }] });
	});

	it("fromApiEvent handles missing name path segment via pop of undefined", () => {
		const { service } = createService();
		const event = (service as any).fromApiEvent({
			name: "lonely",
			invocationId: "inv",
			author: "agent",
			timestamp: "2024-01-01T00:00:00.000Z",
		});
		expect(event.id).toBe("lonely");
	});

	it("fromApiEvent maps empty longRunningToolIds list to empty Set", () => {
		const { service } = createService();
		const event = (service as any).fromApiEvent({
			name: ".../events/e",
			invocationId: "inv",
			author: "agent",
			timestamp: "2024-01-01T00:00:00.000Z",
			eventMetadata: {
				longRunningToolIds: [],
				partial: false,
				turnComplete: true,
				interrupted: false,
				branch: "root",
			},
		});
		expect(event.longRunningToolIds).toEqual(new Set());
		expect(event.turnComplete).toBe(true);
		expect(event.branch).toBe("root");
	});

	it("fromApiEvent leaves longRunningToolIds undefined when list is null", () => {
		const { service } = createService();
		const event = (service as any).fromApiEvent({
			name: ".../events/e2",
			invocationId: "inv",
			author: "agent",
			timestamp: "2024-01-01T00:00:00.000Z",
			eventMetadata: {
				longRunningToolIds: null,
			},
		});
		expect(event.longRunningToolIds).toBeUndefined();
	});

	it("getSession returns undefined and logs when API throws", async () => {
		const { service, asyncRequest } = createService();
		asyncRequest.mockRejectedValueOnce(new Error("boom"));
		await expect(service.getSession("app", "u", "missing")).resolves.toBe(
			undefined,
		);
		expect(console.error).toHaveBeenCalled();
	});

	it("getSession returns early when events response has httpHeaders", async () => {
		const { service, asyncRequest } = createService();
		asyncRequest
			.mockResolvedValueOnce({
				name: "projects/p/locations/l/reasoningEngines/9/sessions/s-empty",
				updateTime: "2024-01-01T00:00:00.000Z",
				sessionState: { a: 1 },
			})
			.mockResolvedValueOnce({ httpHeaders: { x: "y" } });

		const session = await service.getSession("app", "u", "s-empty");
		expect(session?.events).toEqual([]);
		expect(session?.state).toEqual({ a: 1 });
	});

	it("getSession treats null sessionState as empty object", async () => {
		const { service, asyncRequest } = createService();
		asyncRequest
			.mockResolvedValueOnce({
				name: "projects/p/locations/l/reasoningEngines/9/sessions/s-null",
				updateTime: "2024-01-01T00:00:00.000Z",
				sessionState: null,
			})
			.mockResolvedValueOnce({ sessionEvents: [] });

		const session = await service.getSession("app", "u", "s-null");
		expect(session?.state).toEqual({});
	});

	it("getSession pagination continues when a page has no sessionEvents", async () => {
		const { service, asyncRequest } = createService();
		asyncRequest
			.mockResolvedValueOnce({
				name: "projects/p/locations/l/reasoningEngines/9/sessions/s-page",
				updateTime: "2024-01-01T00:00:30.000Z",
				sessionState: {},
			})
			.mockResolvedValueOnce({
				sessionEvents: [
					{
						name: ".../events/e1",
						invocationId: "i1",
						author: "user",
						timestamp: "2024-01-01T00:00:10.000Z",
						content: { parts: [{ text: "one" }] },
					},
				],
				nextPageToken: "tok",
			})
			.mockResolvedValueOnce({
				nextPageToken: undefined,
			});

		const session = await service.getSession("app", "u", "s-page");
		expect(session?.events).toHaveLength(1);
		expect(session?.events[0].content?.parts?.[0]?.text).toBe("one");
	});

	it("getSession afterTimestamp alone slices with inclusive boundary (slice(i))", async () => {
		const { service, asyncRequest } = createService();
		asyncRequest
			.mockResolvedValueOnce({
				name: "projects/p/locations/l/reasoningEngines/9/sessions/s-after",
				updateTime: "2024-01-01T00:00:50.000Z",
				sessionState: {},
			})
			.mockResolvedValueOnce({
				sessionEvents: [
					{
						name: ".../events/a",
						invocationId: "i0",
						author: "user",
						timestamp: "2024-01-01T00:00:10.000Z",
						content: { parts: [{ text: "old" }] },
					},
					{
						name: ".../events/b",
						invocationId: "i1",
						author: "agent",
						timestamp: "2024-01-01T00:00:20.000Z",
						content: { parts: [{ text: "mid" }] },
					},
					{
						name: ".../events/c",
						invocationId: "i2",
						author: "user",
						timestamp: "2024-01-01T00:00:30.000Z",
						content: { parts: [{ text: "new" }] },
					},
				],
			});

		const after = Date.parse("2024-01-01T00:00:15.000Z") / 1000;
		const session = await service.getSession("app", "u", "s-after", {
			afterTimestamp: after,
		});
		// Vertex uses slice(i) (includes the first event with ts < after),
		// unlike InMemory which uses slice(i + 1).
		expect(session?.events.map((e) => e.content?.parts?.[0]?.text)).toEqual([
			"old",
			"mid",
			"new",
		]);
	});

	it("getSession afterTimestamp with all events newer leaves list unchanged", async () => {
		const { service, asyncRequest } = createService();
		asyncRequest
			.mockResolvedValueOnce({
				name: "projects/p/locations/l/reasoningEngines/9/sessions/s-all-new",
				updateTime: "2024-01-01T00:00:50.000Z",
				sessionState: {},
			})
			.mockResolvedValueOnce({
				sessionEvents: [
					{
						name: ".../events/a",
						invocationId: "i0",
						author: "user",
						timestamp: "2024-01-01T00:00:20.000Z",
						content: { parts: [{ text: "a" }] },
					},
					{
						name: ".../events/b",
						invocationId: "i1",
						author: "agent",
						timestamp: "2024-01-01T00:00:30.000Z",
						content: { parts: [{ text: "b" }] },
					},
				],
			});

		const session = await service.getSession("app", "u", "s-all-new", {
			afterTimestamp: 1,
		});
		expect(session?.events).toHaveLength(2);
	});

	it("getSession prefers numRecentEvents over afterTimestamp via else-if", async () => {
		const { service, asyncRequest } = createService();
		asyncRequest
			.mockResolvedValueOnce({
				name: "projects/p/locations/l/reasoningEngines/9/sessions/s-pref",
				updateTime: "2024-01-01T00:00:50.000Z",
				sessionState: {},
			})
			.mockResolvedValueOnce({
				sessionEvents: [
					{
						name: ".../events/a",
						invocationId: "i0",
						author: "user",
						timestamp: "2024-01-01T00:00:10.000Z",
						content: { parts: [{ text: "a" }] },
					},
					{
						name: ".../events/b",
						invocationId: "i1",
						author: "agent",
						timestamp: "2024-01-01T00:00:20.000Z",
						content: { parts: [{ text: "b" }] },
					},
					{
						name: ".../events/c",
						invocationId: "i2",
						author: "user",
						timestamp: "2024-01-01T00:00:30.000Z",
						content: { parts: [{ text: "c" }] },
					},
				],
			});

		const session = await service.getSession("app", "u", "s-pref", {
			numRecentEvents: 1,
			afterTimestamp: Date.parse("2024-01-01T00:00:25.000Z") / 1000,
		});
		expect(session?.events.map((e) => e.content?.parts?.[0]?.text)).toEqual([
			"c",
		]);
	});

	it("listSessions omits filter when userId is empty string", async () => {
		const { service, asyncRequest } = createService();
		asyncRequest.mockResolvedValueOnce({ sessions: [] });
		await service.listSessions("app", "");
		expect(asyncRequest).toHaveBeenCalledWith({
			http_method: "GET",
			path: "reasoningEngines/9/sessions",
			request_dict: {},
		});
	});

	it("listSessions returns empty when response has httpHeaders", async () => {
		const { service, asyncRequest } = createService();
		asyncRequest.mockResolvedValueOnce({ httpHeaders: {} });
		await expect(service.listSessions("app", "u")).resolves.toEqual({
			sessions: [],
		});
	});

	it("listSessions maps sessions missing updateTime to NaN lastUpdateTime", async () => {
		const { service, asyncRequest } = createService();
		asyncRequest.mockResolvedValueOnce({
			sessions: [
				{
					name: "projects/p/locations/l/reasoningEngines/9/sessions/s1",
				},
			],
		});
		const listed = await service.listSessions("app", "u");
		expect(listed.sessions).toHaveLength(1);
		expect(listed.sessions[0].id).toBe("s1");
		expect(Number.isNaN(listed.sessions[0].lastUpdateTime)).toBe(true);
	});

	it("deleteSession rethrows API errors after logging", async () => {
		const { service, asyncRequest } = createService();
		asyncRequest.mockRejectedValueOnce(new Error("deny"));
		await expect(service.deleteSession("app", "u", "s1")).rejects.toThrow(
			/deny/,
		);
		expect(console.error).toHaveBeenCalled();
	});

	it("appendEvent posts contentful payload and updates local session", async () => {
		const { service, asyncRequest } = createService();
		asyncRequest.mockResolvedValueOnce({});
		const session = {
			id: "sess-c",
			appName: "app",
			userId: "u",
			state: {},
			events: [] as Event[],
			lastUpdateTime: 0,
		};
		const event = new Event({
			author: "user",
			invocationId: "inv",
			timestamp: 12.5,
			content: { role: "user", parts: [{ text: "hello" }] },
			actions: new EventActions({
				stateDelta: { k: 1 },
				transferToAgent: "child",
			}),
			longRunningToolIds: new Set(["tool"]),
			partial: false,
			turnComplete: true,
			branch: "main",
		});

		await service.appendEvent(session, event);
		expect(session.events).toHaveLength(1);
		expect(session.state.k).toBe(1);
		const body = asyncRequest.mock.calls[0][0].request_dict;
		expect(body.content).toEqual({
			role: "user",
			parts: [{ text: "hello" }],
		});
		expect(body.actions.transfer_agent).toBe("child");
		expect(body.event_metadata.long_running_tool_ids).toEqual(["tool"]);
		expect(body.timestamp).toEqual({ seconds: 12, nanos: 500_000_000 });
	});

	it("appendEvent still posts remote for partial events after local skip", async () => {
		const { service, asyncRequest } = createService();
		asyncRequest.mockResolvedValueOnce({});
		const session = {
			id: "sess-p",
			appName: "app",
			userId: "u",
			state: {},
			events: [] as Event[],
			lastUpdateTime: 0,
		};
		await service.appendEvent(
			session,
			new Event({
				author: "agent",
				partial: true,
				timestamp: 3,
				content: { parts: [{ text: "stream" }] },
			}),
		);
		expect(session.events).toHaveLength(0);
		expect(asyncRequest).toHaveBeenCalledWith({
			http_method: "POST",
			path: "reasoningEngines/9/sessions/sess-p:appendEvent",
			request_dict: expect.objectContaining({
				author: "agent",
				event_metadata: expect.objectContaining({ partial: true }),
			}),
		});
	});

	it("decodeContent and decodeGroundingMetadata pass through or undefined", () => {
		const { service } = createService();
		expect((service as any).decodeContent(undefined)).toBeUndefined();
		expect((service as any).decodeContent(null)).toBeUndefined();
		expect((service as any).decodeContent({ role: "user" })).toEqual({
			role: "user",
		});
		expect((service as any).decodeGroundingMetadata(undefined)).toBeUndefined();
		expect((service as any).decodeGroundingMetadata({ x: 1 })).toEqual({
			x: 1,
		});
	});
});
