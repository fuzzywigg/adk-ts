import { describe, expect, it } from "vitest";
import {
	AgentListItemDto,
	AgentsListResponseDto,
	ErrorResponseDto,
	EventItemDto,
	EventsResponseDto,
	GraphEdgeDto,
	GraphNodeDto,
	GraphResponseDto,
	HealthResponseDto,
	MessageItemDto,
	MessageResponseDto,
	MessagesResponseDto,
	SessionResponseDto,
	SessionsResponseDto,
	StateMetadataDto,
	StateResponseDto,
	SuccessResponseDto,
} from "../../../http/dto/api.dto";

describe("api.dto response shapes", () => {
	it("constructs success and error envelopes", () => {
		const ok = Object.assign(new SuccessResponseDto(), { success: true });
		const err = Object.assign(new ErrorResponseDto(), {
			error: "Failed to load agent",
		});
		expect(ok.success).toBe(true);
		expect(err.error).toMatch(/Failed/);
	});

	it("constructs agent list DTOs", () => {
		const item = Object.assign(new AgentListItemDto(), {
			path: "/a",
			name: "A",
			directory: "a",
			relativePath: "a",
		});
		const list = Object.assign(new AgentsListResponseDto(), {
			agents: [item],
		});
		expect(list.agents[0].name).toBe("A");
	});

	it("constructs messaging DTOs", () => {
		const message = Object.assign(new MessageItemDto(), {
			id: 1,
			type: "user" as const,
			content: "Hello",
			timestamp: "2024-01-01T00:00:00.000Z",
		});
		const messages = Object.assign(new MessagesResponseDto(), {
			messages: [message],
		});
		const response = Object.assign(new MessageResponseDto(), {
			response: "Hi",
			agentName: "ResearchAgent",
		});
		expect(messages.messages[0].type).toBe("user");
		expect(response.agentName).toBe("ResearchAgent");
	});

	it("constructs session, event, state, health, and graph DTOs", () => {
		const session = Object.assign(new SessionResponseDto(), {
			id: "s1",
			appName: "app",
			userId: "u",
			state: {},
			eventCount: 0,
			lastUpdateTime: 1,
			createdAt: 1,
		});
		const sessions = Object.assign(new SessionsResponseDto(), {
			sessions: [session],
		});
		const event = Object.assign(new EventItemDto(), {
			id: "e1",
			author: "user",
			timestamp: 1,
			content: {},
			actions: null,
			functionCalls: [],
			functionResponses: [],
			isFinalResponse: false,
		});
		const events = Object.assign(new EventsResponseDto(), {
			events: [event],
			totalCount: 1,
		});
		const metadata = Object.assign(new StateMetadataDto(), {
			lastUpdated: 1,
			changeCount: 0,
			totalKeys: 0,
			sizeBytes: 0,
		});
		const state = Object.assign(new StateResponseDto(), {
			agentState: {},
			userState: {},
			sessionState: {},
			metadata,
		});
		const health = Object.assign(new HealthResponseDto(), {
			status: "ok",
			version: "0.0.0",
		});
		const node = Object.assign(new GraphNodeDto(), {
			id: "n1",
			label: "Agent",
			kind: "agent" as const,
		});
		const edge = Object.assign(new GraphEdgeDto(), {
			from: "n1",
			to: "n2",
		});
		const graph = Object.assign(new GraphResponseDto(), {
			nodes: [node],
			edges: [edge],
		});

		expect(sessions.sessions[0].id).toBe("s1");
		expect(events.totalCount).toBe(1);
		expect(state.metadata.totalKeys).toBe(0);
		expect(health.status).toBe("ok");
		expect(graph.edges[0].from).toBe("n1");
	});
});
