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

describe("VertexAiSessionService leftover: stateDelta || {} sparse actions", () => {
	beforeEach(() => {
		vi.spyOn(console, "debug").mockImplementation(() => undefined);
		vi.spyOn(console, "error").mockImplementation(() => undefined);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	const sparseStateCases = [
		{ label: "omitted", actions: { escalate: true } },
		{ label: "undefined", actions: { stateDelta: undefined, escalate: false } },
		{ label: "null", actions: { stateDelta: null, transferAgent: "child" } },
		{ label: "0", actions: { stateDelta: 0, escalate: true } },
		{ label: "empty-string", actions: { stateDelta: "", escalate: true } },
		{ label: "false", actions: { stateDelta: false, escalate: true } },
	] as const;

	for (const { label, actions } of sparseStateCases) {
		it(`fromApiEvent coalesces falsy stateDelta (${label}) to {}`, () => {
			const { service } = createService();
			const event = (service as any).fromApiEvent({
				name: ".../events/state-" + label,
				invocationId: "inv",
				author: "agent",
				timestamp: "2024-01-01T00:00:00.000Z",
				actions,
			});
			expect(event.actions.stateDelta).toEqual({});
		});
	}

	it("preserves populated stateDelta maps", () => {
		const { service } = createService();
		const event = (service as any).fromApiEvent({
			name: ".../events/state-full",
			invocationId: "inv",
			author: "agent",
			timestamp: "2024-01-01T00:00:00.000Z",
			actions: { stateDelta: { a: 1, b: { c: 2 } } },
		});
		expect(event.actions.stateDelta).toEqual({ a: 1, b: { c: 2 } });
	});
});

describe("VertexAiSessionService leftover: artifactDelta || {} sparse actions", () => {
	const sparseArtifactCases = [
		{ label: "omitted", actions: { skipSummarization: true } },
		{
			label: "undefined",
			actions: { artifactDelta: undefined, escalate: true },
		},
		{ label: "null", actions: { artifactDelta: null } },
		{ label: "0", actions: { artifactDelta: 0 } },
		{ label: "empty-string", actions: { artifactDelta: "" } },
		{ label: "false", actions: { artifactDelta: false } },
	] as const;

	for (const { label, actions } of sparseArtifactCases) {
		it(`fromApiEvent coalesces falsy artifactDelta (${label}) to {}`, () => {
			const { service } = createService();
			const event = (service as any).fromApiEvent({
				name: ".../events/art-" + label,
				invocationId: "inv",
				author: "agent",
				timestamp: "2024-01-01T00:00:00.000Z",
				actions,
			});
			expect(event.actions.artifactDelta).toEqual({});
		});
	}

	it("preserves populated artifactDelta maps", () => {
		const { service } = createService();
		const event = (service as any).fromApiEvent({
			name: ".../events/art-full",
			invocationId: "inv",
			author: "agent",
			timestamp: "2024-01-01T00:00:00.000Z",
			actions: { artifactDelta: { "file.txt": 3 } },
		});
		expect(event.actions.artifactDelta).toEqual({ "file.txt": 3 });
	});
});

describe("VertexAiSessionService leftover: requestedAuthConfigs || {} sparse actions", () => {
	const sparseAuthCases = [
		{ label: "omitted", actions: { transferAgent: "x" } },
		{
			label: "undefined",
			actions: { requestedAuthConfigs: undefined },
		},
		{ label: "null", actions: { requestedAuthConfigs: null } },
		{ label: "0", actions: { requestedAuthConfigs: 0 } },
		{ label: "empty-string", actions: { requestedAuthConfigs: "" } },
		{ label: "false", actions: { requestedAuthConfigs: false } },
	] as const;

	for (const { label, actions } of sparseAuthCases) {
		it(`fromApiEvent coalesces falsy requestedAuthConfigs (${label}) to {}`, () => {
			const { service } = createService();
			const event = (service as any).fromApiEvent({
				name: ".../events/auth-" + label,
				invocationId: "inv",
				author: "agent",
				timestamp: "2024-01-01T00:00:00.000Z",
				actions,
			});
			expect(event.actions.requestedAuthConfigs).toEqual({});
		});
	}

	it("preserves populated requestedAuthConfigs", () => {
		const { service } = createService();
		const event = (service as any).fromApiEvent({
			name: ".../events/auth-full",
			invocationId: "inv",
			author: "agent",
			timestamp: "2024-01-01T00:00:00.000Z",
			actions: {
				requestedAuthConfigs: { tool1: { authScheme: { type: "apiKey" } } },
			},
		});
		expect(event.actions.requestedAuthConfigs).toEqual({
			tool1: { authScheme: { type: "apiKey" } },
		});
	});
});

describe("VertexAiSessionService leftover: combined sparse action matrices", () => {
	const combos: Array<{
		label: string;
		actions: Record<string, unknown>;
	}> = [
		{
			label: "all three omitted",
			actions: { escalate: true, transferAgent: "t" },
		},
		{
			label: "all three null",
			actions: {
				stateDelta: null,
				artifactDelta: null,
				requestedAuthConfigs: null,
			},
		},
		{
			label: "all three undefined",
			actions: {
				stateDelta: undefined,
				artifactDelta: undefined,
				requestedAuthConfigs: undefined,
			},
		},
		{
			label: "mixed falsy",
			actions: {
				stateDelta: 0,
				artifactDelta: "",
				requestedAuthConfigs: false,
				skipSummarization: true,
			},
		},
		{
			label: "state present others falsy",
			actions: {
				stateDelta: { k: 1 },
				artifactDelta: null,
				requestedAuthConfigs: undefined,
			},
		},
		{
			label: "artifact present others falsy",
			actions: {
				stateDelta: false,
				artifactDelta: { a: 2 },
				requestedAuthConfigs: 0,
			},
		},
		{
			label: "auth present others falsy",
			actions: {
				stateDelta: null,
				artifactDelta: "",
				requestedAuthConfigs: { x: {} },
			},
		},
	];

	for (const { label, actions } of combos) {
		it(`combined sparse coalesce: ${label}`, () => {
			const { service } = createService();
			const event = (service as any).fromApiEvent({
				name: `.../events/combo-${label.replace(/\s+/g, "-")}`,
				invocationId: "inv",
				author: "agent",
				timestamp: "2024-01-01T00:00:00.000Z",
				actions,
			});
			expect(event.actions.stateDelta).toEqual(
				actions.stateDelta && typeof actions.stateDelta === "object"
					? actions.stateDelta
					: {},
			);
			expect(event.actions.artifactDelta).toEqual(
				actions.artifactDelta && typeof actions.artifactDelta === "object"
					? actions.artifactDelta
					: {},
			);
			expect(event.actions.requestedAuthConfigs).toEqual(
				actions.requestedAuthConfigs &&
					typeof actions.requestedAuthConfigs === "object"
					? actions.requestedAuthConfigs
					: {},
			);
		});
	}

	it("getSession maps API events through fromApiEvent sparse defaults", async () => {
		const { service, asyncRequest } = createService();
		asyncRequest
			.mockResolvedValueOnce({
				name: "projects/p/locations/l/reasoningEngines/9/sessions/sess-sparse",
				updateTime: "2024-01-01T00:00:30.000Z",
				sessionState: {},
			})
			.mockResolvedValueOnce({
				sessionEvents: [
					{
						name: ".../events/e1",
						invocationId: "i1",
						author: "agent",
						timestamp: "2024-01-01T00:00:10.000Z",
						actions: {
							escalate: true,
						},
						content: { parts: [{ text: "sparse" }] },
					},
					{
						name: ".../events/e2",
						invocationId: "i2",
						author: "user",
						timestamp: "2024-01-01T00:00:20.000Z",
						actions: {
							stateDelta: null,
							artifactDelta: null,
							requestedAuthConfigs: null,
						},
						content: { parts: [{ text: "nullish" }] },
					},
				],
			});

		const session = await service.getSession("app", "u", "sess-sparse");
		expect(session?.events).toHaveLength(2);
		expect(session?.events[0].actions.stateDelta).toEqual({});
		expect(session?.events[0].actions.artifactDelta).toEqual({});
		expect(session?.events[0].actions.requestedAuthConfigs).toEqual({});
		expect(session?.events[1].actions.stateDelta).toEqual({});
		expect(session?.events[1].actions.artifactDelta).toEqual({});
		expect(session?.events[1].actions.requestedAuthConfigs).toEqual({});
	});

	it("convertEventToJson still serializes explicit empty action maps", () => {
		const { service } = createService();
		const event = new Event({
			id: "e1",
			invocationId: "inv",
			author: "agent",
			timestamp: 1700000000,
			actions: new EventActions({
				stateDelta: {},
				artifactDelta: {},
				requestedAuthConfigs: {},
			}),
		});
		const json = (service as any).convertEventToJson(event);
		expect(json.actions.state_delta).toEqual({});
		expect(json.actions.artifact_delta).toEqual({});
		expect(json.actions.requested_auth_configs).toEqual({});
	});

	it("actions absent yields default EventActions without sparse coalesce branch", () => {
		const { service } = createService();
		const event = (service as any).fromApiEvent({
			name: ".../events/no-actions",
			invocationId: "inv",
			author: "agent",
			timestamp: "2024-01-01T00:00:00.000Z",
		});
		expect(event.actions).toBeInstanceOf(EventActions);
		expect(event.actions.stateDelta).toEqual({});
		expect(event.actions.artifactDelta).toEqual({});
		expect(event.actions.requestedAuthConfigs).toEqual({});
	});
});
