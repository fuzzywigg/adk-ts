import { beforeEach, describe, expect, it } from "vitest";
import { LlmAgent } from "../agents/llm-agent";
import { Event } from "../events/event";
import { EventActions } from "../events/event-actions";
import { Runner } from "../runners";
import { InMemorySessionService } from "../sessions/in-memory-session-service";

describe("Runner state-delta prefix case + ref !== seventh leftover (post #158)", () => {
	let sessionService: InMemorySessionService;
	let agent: LlmAgent;
	let runner: Runner;

	beforeEach(() => {
		sessionService = new InMemorySessionService();
		agent = new LlmAgent({
			name: "root_agent",
			model: "gemini-2.0-flash-exp",
		});
		runner = new Runner({
			appName: "runner-app",
			agent,
			sessionService,
		});
	});

	it.each([
		{ label: "App:", key: "App:theme" },
		{ label: "USER:", key: "USER:locale" },
		{ label: "User:", key: "User:name" },
		{ label: "APP:", key: "APP:flag" },
	] as const)("treats $label prefix as session-scoped (case-sensitive startsWith app:/user:)", async ({
		key,
	}) => {
		const before = new Event({
			author: "root_agent",
			invocationId: "inv-a",
			actions: new EventActions({ stateDelta: { [key]: "old", keep: 1 } }),
		});
		const after = new Event({
			author: "root_agent",
			invocationId: "inv-b",
			actions: new EventActions({ stateDelta: { [key]: "new", keep: 2 } }),
		});
		const session = {
			id: "s1",
			appName: "runner-app",
			userId: "u1",
			state: { [key]: "new", keep: 2 },
			events: [before, after],
			lastUpdateTime: 0,
		};

		const delta = await (runner as any)._computeStateDeltaForRewind(session, 1);
		expect(delta[key]).toBe("old");
		expect(delta.keep).toBe(1);
	});

	it("includes keys when currentState value is a different object reference with equal content", async () => {
		const sharedShape = { nested: true };
		const before = new Event({
			author: "root_agent",
			invocationId: "inv-a",
			actions: new EventActions({
				stateDelta: { obj: { nested: true } },
			}),
		});
		const after = new Event({
			author: "root_agent",
			invocationId: "inv-b",
			actions: new EventActions({
				stateDelta: { obj: sharedShape },
			}),
		});
		const session = {
			id: "s2",
			appName: "runner-app",
			userId: "u1",
			state: { obj: sharedShape },
			events: [before, after],
			lastUpdateTime: 0,
		};

		const delta = await (runner as any)._computeStateDeltaForRewind(session, 1);
		expect(delta).toHaveProperty("obj");
		expect(delta.obj).toEqual({ nested: true });
		expect(delta.obj).not.toBe(sharedShape);
	});

	it("omits keys when currentState holds the identical reference restored at rewind", async () => {
		const sameRef = { nested: true };
		const before = new Event({
			author: "root_agent",
			invocationId: "inv-a",
			actions: new EventActions({ stateDelta: { obj: sameRef } }),
		});
		const after = new Event({
			author: "root_agent",
			invocationId: "inv-b",
			actions: new EventActions({ stateDelta: { other: 1 } }),
		});
		const session = {
			id: "s3",
			appName: "runner-app",
			userId: "u1",
			state: { obj: sameRef, other: 1 },
			events: [before, after],
			lastUpdateTime: 0,
		};

		const delta = await (runner as any)._computeStateDeltaForRewind(session, 1);
		expect(delta.obj).toBeUndefined();
		expect(delta.other).toBeNull();
	});
});
