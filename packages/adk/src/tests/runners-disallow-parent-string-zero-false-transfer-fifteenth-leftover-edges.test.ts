import { describe, expect, it } from "vitest";
import { LlmAgent } from "../agents/llm-agent";
import { Event } from "../events/event";
import { Runner } from "../runners";
import { InMemorySessionService } from "../sessions/in-memory-session-service";
import type { Session } from "../sessions/session";

/**
 * Fifteenth leftover (HEAVY tip-relaunch residual after tip #254 / 96457a9): residual after fourteenth `"true"`/`[]`/`1` block —
 * string `"0"` / `"false"` are also truthy via `if (agent.disallowTransferToParent)`
 * so transfer is blocked and Runner falls back to the root agent.
 */
describe("runners disallowTransferToParent string-zero/false fifteenth leftover", () => {
	const sessionService = new InMemorySessionService();

	function sessionWithChildAuthor(): Session {
		return {
			id: "s1",
			userId: "u1",
			appName: "xfer-app",
			state: {},
			lastUpdateTime: 0,
			events: [
				new Event({
					author: "user",
					content: { role: "user", parts: [{ text: "hi" }] },
				}),
				new Event({
					author: "child_agent",
					content: { role: "model", parts: [{ text: "prior" }] },
				}),
			],
		} as Session;
	}

	it.each([
		{ label: '"0"', value: "0" },
		{ label: '"false"', value: "false" },
	])("disallowTransferToParent=$label blocks sub-agent → root", ({ value }) => {
		const child = new LlmAgent({
			name: "child_agent",
			model: "gemini-2.0-flash-exp",
		});
		(child as any).disallowTransferToParent = value;
		const root = new LlmAgent({
			name: "root_agent",
			model: "gemini-2.0-flash-exp",
			subAgents: [child],
		});
		const runner = new Runner({
			appName: "xfer-app",
			agent: root,
			sessionService,
		});

		expect(
			(runner as any)._findAgentToRun(sessionWithChildAuthor(), root),
		).toBe(root);
	});

	it("disallowTransferToParent=false still resumes child (control)", () => {
		const child = new LlmAgent({
			name: "child_agent",
			model: "gemini-2.0-flash-exp",
		});
		(child as any).disallowTransferToParent = false;
		const root = new LlmAgent({
			name: "root_agent",
			model: "gemini-2.0-flash-exp",
			subAgents: [child],
		});
		const runner = new Runner({
			appName: "xfer-app",
			agent: root,
			sessionService,
		});

		expect(
			(runner as any)._findAgentToRun(sessionWithChildAuthor(), root),
		).toBe(child);
	});

	it("numeric 0 still resumes child (falsy control)", () => {
		const child = new LlmAgent({
			name: "child_agent",
			model: "gemini-2.0-flash-exp",
		});
		(child as any).disallowTransferToParent = 0;
		const root = new LlmAgent({
			name: "root_agent",
			model: "gemini-2.0-flash-exp",
			subAgents: [child],
		});
		const runner = new Runner({
			appName: "xfer-app",
			agent: root,
			sessionService,
		});

		expect(
			(runner as any)._findAgentToRun(sessionWithChildAuthor(), root),
		).toBe(child);
	});
});
