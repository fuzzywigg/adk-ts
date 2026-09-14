import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Event } from "../../events/event";
import { EventActions } from "../../events/event-actions";
import { VertexAiSessionService } from "../../sessions/vertex-ai-session-service";
import { State } from "../../sessions/state";

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

describe("VertexAiSessionService + State heavy matrix edges", () => {
	beforeEach(() => {
		vi.spyOn(console, "debug").mockImplementation(() => undefined);
		vi.spyOn(console, "error").mockImplementation(() => undefined);
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it("rejects user-provided session ids without calling the API", async () => {
		const { service, asyncRequest } = createService();
		await expect(
			service.createSession("app", "user", {}, "custom"),
		).rejects.toThrow(/User-provided Session id is not supported/);
		expect(asyncRequest).not.toHaveBeenCalled();
	});

	it("createSession posts LRO then returns session resource", async () => {
		const { service, asyncRequest } = createService({ agentEngineId: "42" });
		asyncRequest
			.mockResolvedValueOnce({
				name: "projects/p/locations/l/reasoningEngines/42/sessions/sess/operations/op",
			})
			.mockResolvedValueOnce({ done: true })
			.mockResolvedValueOnce({
				name: "projects/p/locations/l/reasoningEngines/42/sessions/sess",
				updateTime: "2024-01-01T00:00:00.000Z",
				sessionState: { seed: 1 },
			});
		const session = await service.createSession("app", "u", { seed: 1 });
		expect(session.id).toBe("sess");
		expect(session.state).toEqual({ seed: 1 });
	});

	it("createSession without state omits session_state", async () => {
		const { service, asyncRequest } = createService({ agentEngineId: "1" });
		asyncRequest
			.mockResolvedValueOnce({
				name: "projects/p/locations/l/reasoningEngines/1/sessions/s/operations/o",
			})
			.mockResolvedValueOnce({ done: true })
			.mockResolvedValueOnce({
				name: "projects/p/locations/l/reasoningEngines/1/sessions/s",
				updateTime: "2024-01-01T00:00:00.000Z",
			});
		await service.createSession("app", "u");
		expect(asyncRequest.mock.calls[0][0].request_dict).toEqual({
			user_id: "u",
		});
	});

	it("uses numeric appName as engine id when agentEngineId omitted", async () => {
		const { service, asyncRequest } = createService({
			project: "p",
			location: "l",
		});
		asyncRequest
			.mockResolvedValueOnce({
				name: "projects/p/locations/l/reasoningEngines/77/sessions/x/operations/o",
			})
			.mockResolvedValueOnce({ done: true })
			.mockResolvedValueOnce({
				name: "projects/p/locations/l/reasoningEngines/77/sessions/x",
				updateTime: "2024-01-01T00:00:00.000Z",
			});
		await service.createSession("77", "u");
		expect(asyncRequest.mock.calls[0][0].path).toBe(
			"reasoningEngines/77/sessions",
		);
	});

	it("extracts engine id from full resource app names", async () => {
		const { service, asyncRequest } = createService({
			project: "p",
			location: "l",
		});
		asyncRequest
			.mockResolvedValueOnce({
				name: "projects/p/locations/l/reasoningEngines/555/sessions/x/operations/o",
			})
			.mockResolvedValueOnce({ done: true })
			.mockResolvedValueOnce({
				name: "projects/p/locations/l/reasoningEngines/555/sessions/x",
				updateTime: "2024-01-01T00:00:00.000Z",
			});
		await service.createSession(
			"projects/p/locations/l/reasoningEngines/555",
			"u",
		);
		expect(asyncRequest.mock.calls[0][0].path).toContain("555");
	});

	it("rejects invalid non-numeric app names without agentEngineId", async () => {
		const { service } = createService({ project: "p", location: "l" });
		await expect(service.createSession("not-valid", "u")).rejects.toThrow(
			/not valid/,
		);
	});

	it("agentEngineId wins over numeric appName", async () => {
		const { service, asyncRequest } = createService({
			agentEngineId: "preferred",
		});
		asyncRequest.mockResolvedValueOnce({ httpHeaders: {} });
		await service.getSession("999", "u", "sess");
		expect(asyncRequest.mock.calls[0][0].path).toContain(
			"reasoningEngines/preferred/sessions/sess",
		);
	});

	it("getSession returns undefined when API throws", async () => {
		const { service, asyncRequest } = createService();
		asyncRequest.mockRejectedValueOnce(new Error("not found"));
		await expect(
			service.getSession("app", "u", "missing"),
		).resolves.toBeUndefined();
	});

	it("getSession returns early when events response is headers-only", async () => {
		const { service, asyncRequest } = createService();
		asyncRequest
			.mockResolvedValueOnce({
				name: "projects/p/locations/l/reasoningEngines/9/sessions/s1",
				updateTime: "2024-01-01T00:00:00.000Z",
				sessionState: { a: 1 },
			})
			.mockResolvedValueOnce({ httpHeaders: { "x-empty": "1" } });
		const session = await service.getSession("app", "u", "s1");
		expect(session).toMatchObject({ id: "s1", state: { a: 1 }, events: [] });
	});

	it("getSession maps events and applies numRecentEvents", async () => {
		const { service, asyncRequest } = createService();
		asyncRequest
			.mockResolvedValueOnce({
				name: "projects/p/locations/l/reasoningEngines/9/sessions/s1",
				updateTime: "2024-01-01T00:00:30.000Z",
				sessionState: {},
			})
			.mockResolvedValueOnce({
				sessionEvents: [
					{
						name: ".../e0",
						invocationId: "i0",
						author: "user",
						timestamp: "2024-01-01T00:00:01.000Z",
						content: { parts: [{ text: "old" }] },
					},
					{
						name: ".../e1",
						invocationId: "i1",
						author: "agent",
						timestamp: "2024-01-01T00:00:10.000Z",
						content: { parts: [{ text: "new" }] },
					},
				],
			});
		const session = await service.getSession("app", "u", "s1", {
			numRecentEvents: 1,
		});
		expect(session?.events.map((e) => e.content?.parts?.[0]?.text)).toEqual([
			"new",
		]);
	});

	it("numRecentEvents ignores afterTimestamp (else-if asymmetry)", async () => {
		const { service, asyncRequest } = createService();
		asyncRequest
			.mockResolvedValueOnce({
				name: "projects/p/locations/l/reasoningEngines/9/sessions/s1",
				updateTime: "2024-01-01T00:00:30.000Z",
				sessionState: {},
			})
			.mockResolvedValueOnce({
				sessionEvents: [
					{
						name: ".../e0",
						invocationId: "i0",
						author: "user",
						timestamp: "2024-01-01T00:00:01.000Z",
						content: { parts: [{ text: "old" }] },
					},
					{
						name: ".../e1",
						invocationId: "i1",
						author: "agent",
						timestamp: "2024-01-01T00:00:10.000Z",
						content: { parts: [{ text: "mid" }] },
					},
					{
						name: ".../e2",
						invocationId: "i2",
						author: "user",
						timestamp: "2024-01-01T00:00:20.000Z",
						content: { parts: [{ text: "new" }] },
					},
				],
			});
		const session = await service.getSession("app", "u", "s1", {
			numRecentEvents: 2,
			afterTimestamp: Date.parse("2024-01-01T00:00:15.000Z") / 1000,
		});
		expect(session?.events.map((e) => e.content?.parts?.[0]?.text)).toEqual([
			"mid",
			"new",
		]);
	});

	it("afterTimestamp alone includes first event with timestamp < threshold", async () => {
		const { service, asyncRequest } = createService();
		asyncRequest
			.mockResolvedValueOnce({
				name: "projects/p/locations/l/reasoningEngines/9/sessions/s1",
				updateTime: "2024-01-01T00:00:30.000Z",
				sessionState: {},
			})
			.mockResolvedValueOnce({
				sessionEvents: [
					{
						name: ".../e0",
						invocationId: "i0",
						author: "user",
						timestamp: "2024-01-01T00:00:01.000Z",
						content: { parts: [{ text: "old" }] },
					},
					{
						name: ".../e1",
						invocationId: "i1",
						author: "agent",
						timestamp: "2024-01-01T00:00:10.000Z",
						content: { parts: [{ text: "new" }] },
					},
				],
			});
		const session = await service.getSession("app", "u", "s1", {
			afterTimestamp: Date.parse("2024-01-01T00:00:05.000Z") / 1000,
		});
		expect(session?.events.map((e) => e.content?.parts?.[0]?.text)).toEqual([
			"old",
			"new",
		]);
	});

	it("paginates through nextPageToken hops", async () => {
		const { service, asyncRequest } = createService();
		asyncRequest
			.mockResolvedValueOnce({
				name: "projects/p/locations/l/reasoningEngines/9/sessions/s1",
				updateTime: "2024-01-01T00:01:00.000Z",
				sessionState: {},
			})
			.mockResolvedValueOnce({
				sessionEvents: [
					{
						name: ".../e1",
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
						name: ".../e2",
						invocationId: "i2",
						author: "agent",
						timestamp: "2024-01-01T00:00:02.000Z",
						content: { parts: [{ text: "p2" }] },
					},
				],
			});
		const session = await service.getSession("app", "u", "s1");
		expect(session?.events.map((e) => e.content?.parts?.[0]?.text)).toEqual([
			"p1",
			"p2",
		]);
		expect(asyncRequest.mock.calls[2][0].path).toContain("pageToken=tok-a");
	});

	it("listSessions maps API session list entries", async () => {
		const { service, asyncRequest } = createService();
		asyncRequest.mockResolvedValueOnce({
			sessions: [
				{
					name: "projects/p/locations/l/reasoningEngines/9/sessions/a",
					userId: "u",
					updateTime: "2024-01-01T00:00:00.000Z",
				},
				{
					name: "projects/p/locations/l/reasoningEngines/9/sessions/b",
					userId: "u",
					updateTime: "2024-01-02T00:00:00.000Z",
				},
			],
		});
		const listed = await service.listSessions("app", "u");
		expect(listed.sessions.map((s) => s.id).sort()).toEqual(["a", "b"]);
	});

	it("listSessions propagates API errors (asymmetry vs getSession undefined)", async () => {
		const { service, asyncRequest } = createService();
		asyncRequest.mockRejectedValueOnce(new Error("boom"));
		await expect(service.listSessions("app", "u")).rejects.toThrow("boom");
	});

	it("deleteSession issues DELETE and ignores missing resources", async () => {
		const { service, asyncRequest } = createService();
		asyncRequest.mockResolvedValueOnce({});
		await expect(
			service.deleteSession("app", "u", "sess"),
		).resolves.toBeUndefined();
		expect(asyncRequest.mock.calls[0][0].http_method).toBe("DELETE");
	});

	it("appendEvent posts event; temp_ keys remain in state_delta payload (documented asymmetry)", async () => {
		const { service, asyncRequest } = createService();
		asyncRequest.mockResolvedValueOnce({});
		const session = {
			appName: "app",
			userId: "u",
			id: "sess",
			state: {},
			events: [],
			lastUpdateTime: 0,
		};
		const event = new Event({
			author: "agent",
			actions: new EventActions({
				stateDelta: { keep: 1, temp_skip: "x" },
			}),
		});
		await service.appendEvent(session as any, event);
		const body = asyncRequest.mock.calls[0][0].request_dict;
		expect(body.actions?.state_delta?.keep).toBe(1);
		expect(body.actions?.state_delta?.temp_skip).toBe("x");
		expect(session.state.keep).toBe(1);
		expect(session.state.temp_skip).toBeUndefined();
	});

	it("createSession times out when LRO never completes", async () => {
		vi.useFakeTimers();
		const { service, asyncRequest } = createService();
		asyncRequest
			.mockResolvedValueOnce({
				name: "projects/p/locations/l/reasoningEngines/9/sessions/s/operations/slow",
			})
			.mockResolvedValue({ done: false });
		const pending = service.createSession("app", "u");
		const assertion = expect(pending).rejects.toThrow(/Timeout/);
		await vi.runAllTimersAsync();
		await assertion;
	});

	it("State prefix constants remain app:/user:/temp:", () => {
		expect(State.APP_PREFIX).toBe("app:");
		expect(State.USER_PREFIX).toBe("user:");
		expect(State.TEMP_PREFIX).toBe("temp:");
	});

	it("State.create prefers delta over committed value", () => {
		const state = State.create({ k: "v" }, { k: "d" });
		expect(state.get("k")).toBe("d");
		expect(state["k"]).toBe("d");
		expect(state.toDict()).toEqual({ k: "d" });
	});

	it("State.set and update mark hasDelta and merge maps", () => {
		const state = State.create({ a: 1 }, {});
		expect(state.hasDelta()).toBe(false);
		state.set("b", 2);
		state.update({ a: 3 });
		expect(state.hasDelta()).toBe(true);
		expect(state.toDict()).toEqual({ a: 3, b: 2 });
	});

	it("State supports APP/USER/TEMP keys via set and proxy", () => {
		const state = State.create({}, {});
		const app = `${State.APP_PREFIX}theme`;
		const user = `${State.USER_PREFIX}locale`;
		const temp = `${State.TEMP_PREFIX}scratch`;
		state.set(app, "dark");
		state[user] = "en";
		state[temp] = true;
		expect(state.toDict()).toEqual({
			[app]: "dark",
			[user]: "en",
			[temp]: true,
		});
	});

	it("State.has is true for delta-only keys", () => {
		const state = State.create({}, { pending: "yes" });
		expect(state.has("pending")).toBe(true);
		expect(state.get("pending", "fallback")).toBe("yes");
	});

	it("State raw constructor supports has/hasDelta/toDict", () => {
		const raw = new State({ a: 1 }, { b: 2 });
		expect(raw.has("a")).toBe(true);
		expect(raw.has("b")).toBe(true);
		expect(raw.hasDelta()).toBe(true);
		expect(raw.toDict()).toEqual({ a: 1, b: 2 });
	});

	it("getSession maps EventActions fields from API payloads", async () => {
		const { service, asyncRequest } = createService();
		asyncRequest
			.mockResolvedValueOnce({
				name: "projects/p/locations/l/reasoningEngines/9/sessions/s1",
				updateTime: "2024-01-01T00:00:10.000Z",
				sessionState: {},
			})
			.mockResolvedValueOnce({
				sessionEvents: [
					{
						name: ".../e1",
						invocationId: "inv",
						author: "agent",
						timestamp: "2024-01-01T00:00:01.000Z",
						content: { parts: [{ text: "hi" }] },
						actions: {
							stateDelta: { k: "v" },
							transferAgent: "other",
							escalate: true,
						},
						eventMetadata: {
							partial: false,
							turnComplete: true,
							branch: "root",
							longRunningToolIds: ["t1"],
						},
					},
				],
			});
		const session = await service.getSession("app", "u", "s1");
		expect(session?.events[0].actions?.stateDelta).toEqual({ k: "v" });
		expect(session?.events[0].actions?.transferToAgent).toBe("other");
		expect(session?.events[0].branch).toBe("root");
		expect(Array.from(session?.events[0].longRunningToolIds ?? [])).toEqual([
			"t1",
		]);
	});

	it("appendEvent still posts partial events while leaving local history unchanged", async () => {
		const { service, asyncRequest } = createService();
		asyncRequest.mockResolvedValueOnce({});
		const session = {
			appName: "app",
			userId: "u",
			id: "sess",
			state: {},
			events: [] as any[],
			lastUpdateTime: 0,
		};
		const partial = new Event({ author: "agent", partial: true });
		await service.appendEvent(session as any, partial);
		expect(session.events).toHaveLength(0);
		expect(asyncRequest).toHaveBeenCalledOnce();
	});

	it("createSession LRO path uses operations/ suffix from name", async () => {
		const { service, asyncRequest } = createService();
		asyncRequest
			.mockResolvedValueOnce({
				name: "projects/p/locations/l/reasoningEngines/9/sessions/s/operations/op-99",
			})
			.mockResolvedValueOnce({ done: true })
			.mockResolvedValueOnce({
				name: "projects/p/locations/l/reasoningEngines/9/sessions/s",
				updateTime: "2024-01-01T00:00:00.000Z",
			});
		await service.createSession("app", "u");
		expect(asyncRequest.mock.calls[1][0].path).toBe("operations/op-99");
	});

	it("State update with empty object preserves existing delta", () => {
		const state = State.create({}, { pending: true });
		state.update({});
		expect(state.hasDelta()).toBe(true);
		expect(state.get("pending")).toBe(true);
	});

	it("State toDict merges value then delta so delta wins", () => {
		const state = State.create({ a: 1, b: 2 }, { b: 9, c: 3 });
		expect(state.toDict()).toEqual({ a: 1, b: 9, c: 3 });
	});
});
