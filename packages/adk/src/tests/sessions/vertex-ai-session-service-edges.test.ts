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

describe("VertexAiSessionService leftover edges (post #113)", () => {
	beforeEach(() => {
		vi.spyOn(console, "debug").mockImplementation(() => undefined);
		vi.spyOn(console, "error").mockImplementation(() => undefined);
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
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
		const assertion = expect(pending).rejects.toThrow(/Timeout|op-null/i);
		await vi.runAllTimersAsync();
		await assertion;
	});

	it("getSession returns undefined and logs when the API throws", async () => {
		const { service, asyncRequest } = createService();
		asyncRequest.mockRejectedValueOnce(new Error("boom"));

		await expect(
			service.getSession("app", "u", "missing"),
		).resolves.toBeUndefined();
		expect(console.error).toHaveBeenCalled();
	});

	it("deleteSession rethrows API errors after logging", async () => {
		const { service, asyncRequest } = createService();
		asyncRequest.mockRejectedValueOnce(new Error("cannot delete"));

		await expect(service.deleteSession("app", "u", "sess")).rejects.toThrow(
			/cannot delete/,
		);
		expect(console.error).toHaveBeenCalled();
	});

	it("listSessions without userId omits the filter query", async () => {
		const { service, asyncRequest } = createService();
		asyncRequest.mockResolvedValueOnce({ sessions: [] });
		await service.listSessions("app", "");
		expect(asyncRequest.mock.calls[0][0].path).toBe(
			"reasoningEngines/9/sessions",
		);
	});

	it("listSessions URL-encodes special characters in userId", async () => {
		const { service, asyncRequest } = createService();
		asyncRequest.mockResolvedValueOnce({ sessions: [] });
		await service.listSessions("app", 'user/"x');
		expect(asyncRequest.mock.calls[0][0].path).toContain(
			encodeURIComponent('"user/"x"'),
		);
	});

	it("keeps events whose timestamp equals session updateTime", async () => {
		const { service, asyncRequest } = createService();
		const updateTime = "2024-01-01T00:00:10.000Z";
		asyncRequest
			.mockResolvedValueOnce({
				name: "projects/p/locations/l/reasoningEngines/9/sessions/sess-eq",
				updateTime,
				sessionState: {},
			})
			.mockResolvedValueOnce({
				sessionEvents: [
					{
						name: ".../events/e0",
						invocationId: "i0",
						author: "user",
						timestamp: updateTime,
						content: { parts: [{ text: "boundary" }] },
					},
					{
						name: ".../events/e1",
						invocationId: "i1",
						author: "agent",
						timestamp: "2024-01-01T00:00:11.000Z",
						content: { parts: [{ text: "future" }] },
					},
				],
			});

		const session = await service.getSession("app", "u", "sess-eq");
		expect(session?.events.map((e) => e.content?.parts?.[0]?.text)).toEqual([
			"boundary",
		]);
	});

	it("appendEvent still posts when content is an empty object", async () => {
		const { service, asyncRequest } = createService();
		asyncRequest.mockResolvedValueOnce({});
		const session = {
			id: "sess-empty",
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
			content: {},
		});

		await service.appendEvent(session as any, event);
		expect(asyncRequest).toHaveBeenCalledWith(
			expect.objectContaining({
				http_method: "POST",
				request_dict: expect.objectContaining({ content: {} }),
			}),
		);
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

	it("createSession with empty state {} still sends session_state", async () => {
		const { service, asyncRequest } = createService();
		asyncRequest
			.mockResolvedValueOnce({
				name: "projects/p/locations/l/reasoningEngines/9/sessions/s1/operations/op",
			})
			.mockResolvedValueOnce({ done: true })
			.mockResolvedValueOnce({
				name: "projects/p/locations/l/reasoningEngines/9/sessions/s1",
				updateTime: "2024-01-01T00:00:00.000Z",
				sessionState: {},
			});

		await service.createSession("app", "u", {});
		expect(asyncRequest.mock.calls[0][0].request_dict).toEqual({
			user_id: "u",
			session_state: {},
		});
	});
});

describe("VertexAiSessionService leftover LRO/GET and name edges", () => {
	beforeEach(() => {
		vi.spyOn(console, "debug").mockImplementation(() => undefined);
		vi.spyOn(console, "error").mockImplementation(() => undefined);
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it("rethrows when LRO is done but the follow-up session GET throws", async () => {
		const { service, asyncRequest } = createService();
		asyncRequest
			.mockResolvedValueOnce({
				name: "projects/p/locations/l/reasoningEngines/9/sessions/sess-get/operations/op-get",
			})
			.mockResolvedValueOnce({ done: true })
			.mockRejectedValueOnce(new Error("session GET failed"));

		await expect(service.createSession("app", "u")).rejects.toThrow(
			/session GET failed/,
		);
	});

	it("rejects malformed non-numeric appName when agentEngineId is absent", async () => {
		const { service } = createService({ project: "p", location: "l" } as any);
		await expect(
			service.createSession("not/a/valid/engine", "u"),
		).rejects.toThrow(/App name not\/a\/valid\/engine is not valid/);
		await expect(service.getSession("also-bad", "u", "s1")).rejects.toThrow(
			/App name also-bad is not valid/,
		);
	});

	it("fromApiEvent uses the whole name when it has no slash segments", () => {
		const { service } = createService();
		const event = (service as any).fromApiEvent({
			name: "bare-event-id",
			invocationId: "inv",
			author: "agent",
			timestamp: "2024-01-01T00:00:00.000Z",
			content: { parts: [{ text: "hi" }] },
		});
		expect(event.id).toBe("bare-event-id");
		expect(event.content?.parts?.[0]?.text).toBe("hi");
	});

	it("getSession derives id from a session name without slash path segments", async () => {
		const { service, asyncRequest } = createService();
		asyncRequest
			.mockResolvedValueOnce({
				name: "plain-session-id",
				updateTime: "2024-01-01T00:00:00.000Z",
				sessionState: { k: 1 },
			})
			.mockResolvedValueOnce({ httpHeaders: {} });

		const session = await service.getSession("app", "u", "plain-session-id");
		expect(session?.id).toBe("plain-session-id");
		expect(session?.state).toEqual({ k: 1 });
	});

	it("createSession extracts session id even when operation name is short", async () => {
		const { service, asyncRequest } = createService();
		asyncRequest
			.mockResolvedValueOnce({
				name: "sessX/operations/opY",
			})
			.mockResolvedValueOnce({ done: true })
			.mockResolvedValueOnce({
				name: "projects/p/locations/l/reasoningEngines/9/sessions/sessX",
				updateTime: "2024-01-01T00:00:00.000Z",
				sessionState: {},
			});

		const session = await service.createSession("app", "u");
		expect(session.id).toBe("sessX");
		expect(asyncRequest.mock.calls[2][0].path).toContain("/sessions/sessX");
	});

	it("createSession times out when the LRO never reports done", async () => {
		vi.useFakeTimers();
		const { service, asyncRequest } = createService();
		asyncRequest
			.mockResolvedValueOnce({
				name: "projects/p/locations/l/reasoningEngines/9/sessions/s-to/operations/op-to",
			})
			.mockResolvedValue({ done: false });

		const pending = service.createSession("app", "u");
		await vi.runAllTimersAsync();
		await expect(pending).rejects.toThrow(
			/Timeout waiting for operation op-to to complete/,
		);
	});

	it("getSession returns undefined and logs when the session GET fails", async () => {
		const { service, asyncRequest } = createService();
		asyncRequest.mockRejectedValueOnce(new Error("not found"));
		await expect(
			service.getSession("app", "u", "missing"),
		).resolves.toBeUndefined();
		expect(console.error).toHaveBeenCalled();
	});

	it("deleteSession logs and rethrows API failures", async () => {
		const { service, asyncRequest } = createService();
		asyncRequest.mockRejectedValueOnce(new Error("delete denied"));
		await expect(service.deleteSession("app", "u", "s1")).rejects.toThrow(
			/delete denied/,
		);
		expect(console.error).toHaveBeenCalled();
	});

	it("paginated getSession tolerates a page without sessionEvents", async () => {
		const { service, asyncRequest } = createService();
		asyncRequest
			.mockResolvedValueOnce({
				name: "projects/p/locations/l/reasoningEngines/9/sessions/sess-page",
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
						content: { parts: [{ text: "first" }] },
					},
				],
				nextPageToken: "next",
			})
			.mockResolvedValueOnce({ nextPageToken: undefined });

		const session = await service.getSession("app", "u", "sess-page");
		expect(session?.events.map((e) => e.content?.parts?.[0]?.text)).toEqual([
			"first",
		]);
	});

	it("treats numRecentEvents: 0 as falsy so afterTimestamp still applies", async () => {
		const { service, asyncRequest } = createService();
		asyncRequest
			.mockResolvedValueOnce({
				name: "projects/p/locations/l/reasoningEngines/9/sessions/sess-nre0",
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
						timestamp: "2024-01-01T00:00:20.000Z",
						content: { parts: [{ text: "new" }] },
					},
				],
			});

		const session = await service.getSession("app", "u", "sess-nre0", {
			numRecentEvents: 0,
			afterTimestamp: Date.parse("2024-01-01T00:00:10.000Z") / 1000,
		});
		expect(session?.events.map((e) => e.content?.parts?.[0]?.text)).toEqual([
			"old",
			"new",
		]);
	});

	it("fromApiEvent maps metadata without longRunningToolIds as undefined", () => {
		const { service } = createService();
		const event = (service as any).fromApiEvent({
			name: ".../events/e-meta",
			invocationId: "inv",
			author: "agent",
			timestamp: "2024-01-01T00:00:00.000Z",
			eventMetadata: {
				partial: false,
				turnComplete: true,
				interrupted: false,
				branch: "root",
			},
		});
		expect(event.partial).toBe(false);
		expect(event.turnComplete).toBe(true);
		expect(event.branch).toBe("root");
		expect(event.longRunningToolIds).toBeUndefined();
	});

	it("fromApiEvent without actions still builds a default EventActions", () => {
		const { service } = createService();
		const event = (service as any).fromApiEvent({
			name: ".../events/e-no-act",
			invocationId: "inv",
			author: "agent",
			timestamp: "2024-01-01T00:00:00.000Z",
			content: { parts: [{ text: "plain" }] },
		});
		expect(event.actions).toBeInstanceOf(EventActions);
		expect(event.content?.parts?.[0]?.text).toBe("plain");
	});

	it("convertEventToJson omits content when absent and nulls empty longRunningToolIds", () => {
		const { service } = createService();
		const event = new Event({
			author: "agent",
			invocationId: "inv",
			timestamp: 10.25,
		});
		const payload = (service as any).convertEventToJson(event);
		expect(payload.content).toBeUndefined();
		expect(payload.timestamp).toEqual({
			seconds: 10,
			nanos: 250_000_000,
		});
		expect(payload.event_metadata.long_running_tool_ids).toBeNull();
	});

	it("createSession defaults missing sessionState to {}", async () => {
		const { service, asyncRequest } = createService();
		asyncRequest
			.mockResolvedValueOnce({
				name: "projects/p/locations/l/reasoningEngines/9/sessions/s-empty/operations/op",
			})
			.mockResolvedValueOnce({ done: true })
			.mockResolvedValueOnce({
				name: "projects/p/locations/l/reasoningEngines/9/sessions/s-empty",
				updateTime: "2024-01-01T00:00:00.000Z",
			});

		const session = await service.createSession("app", "u");
		expect(session.state).toEqual({});
		expect(session.id).toBe("s-empty");
	});

	it("listSessions returns [] when response has neither sessions nor httpHeaders", async () => {
		const { service, asyncRequest } = createService();
		asyncRequest.mockResolvedValueOnce({});
		await expect(service.listSessions("app", "u")).resolves.toEqual({
			sessions: [],
		});
	});

	it("rejects createSession when a user-provided sessionId is supplied", async () => {
		const { service } = createService();
		await expect(
			service.createSession("app", "u", {}, "client-id"),
		).rejects.toThrow(/User-provided Session id is not supported/);
	});
});
