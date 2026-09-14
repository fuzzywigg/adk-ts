import { describe, expect, it, vi } from "vitest";
import type { InvocationContext } from "../../../agents/invocation-context";
import { Event } from "../../../events/event";
import { EventActions } from "../../../events/event-actions";
import { generateAuthEvent } from "../../../flows/llm-flows/functions";

vi.mock("../../../logger", () => ({
	Logger: vi.fn(() => ({
		debug: vi.fn(),
		error: vi.fn(),
		warn: vi.fn(),
		info: vi.fn(),
	})),
}));

vi.mock("../../../telemetry", () => ({
	telemetryService: {
		getTracer: vi.fn(() => ({
			startSpan: () => ({
				setStatus: vi.fn(),
				recordException: vi.fn(),
				end: vi.fn(),
			}),
		})),
		traceToolCall: vi.fn(),
	},
}));

function invocation(): InvocationContext {
	return {
		invocationId: "inv-1",
		branch: "main",
		agent: { name: "llm-agent", canonicalModel: "gpt-4o" },
		session: {
			id: "s1",
			appName: "app",
			userId: "u1",
			state: {},
			events: [],
			lastUpdateTime: 0,
		},
	} as unknown as InvocationContext;
}

function responseEvent(requestedAuthConfigs: unknown): Event {
	return new Event({
		author: "agent",
		actions: new EventActions({ requestedAuthConfigs } as any),
		content: { role: "user", parts: [] },
	});
}

describe("generateAuthEvent !requestedAuthConfigs falsy twelfth leftover", () => {
	it.each([
		{ label: "0", value: 0 },
		{ label: "empty string", value: "" },
		{ label: "false", value: false },
		{ label: "null", value: null },
	])("$label requestedAuthConfigs is falsy so generateAuthEvent returns null", ({
		value,
	}) => {
		expect(generateAuthEvent(invocation(), responseEvent(value))).toBeNull();
	});

	it("empty object is truthy so an Event with empty parts is still created", () => {
		const event = generateAuthEvent(invocation(), responseEvent({}));
		expect(event).toBeInstanceOf(Event);
		expect(event?.content?.parts).toEqual([]);
	});
});
