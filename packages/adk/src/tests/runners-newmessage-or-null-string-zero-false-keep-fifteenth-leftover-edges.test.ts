import { describe, expect, it } from "vitest";
import { LlmAgent } from "../agents/llm-agent";
import { Runner } from "../runners";
import { InMemorySessionService } from "../sessions/in-memory-session-service";
import type { Session } from "../sessions/session";

/**
 * Fifteenth leftover deepen (HEAVY tip-relaunch residual after tip #269 /
 * 03ff90a8; supersedes closed #273/#262): matrix leftover pins classic falsy
 * `newMessage` → `userContent: null` via `newMessage || null`. String `"0"` /
 * `"false"` are truthy so they are kept as `userContent` (not coalesced).
 */
describe("runners newMessage || null string-zero/false keep fifteenth leftover", () => {
	it.each([
		{ label: '"0"', value: "0" },
		{ label: '"false"', value: "false" },
	])("_newInvocationContext keeps $label newMessage as userContent", ({
		value,
	}) => {
		const root = new LlmAgent({
			name: "root_agent",
			model: "gemini-2.0-flash-exp",
		});
		const runner = new Runner({
			appName: "runner-app",
			agent: root,
			sessionService: new InMemorySessionService(),
		});
		const session = {
			id: "s",
			userId: "u",
			events: [],
		} as Session;

		const ctx = (runner as any)._newInvocationContext(session, {
			newMessage: value as any,
		});
		expect(ctx.userContent).toBe(value);
		expect(ctx.userContent).not.toBeNull();
	});

	it("empty string still coalesces to null (matrix control)", () => {
		const root = new LlmAgent({
			name: "root_agent",
			model: "gemini-2.0-flash-exp",
		});
		const runner = new Runner({
			appName: "runner-app",
			agent: root,
			sessionService: new InMemorySessionService(),
		});
		const session = {
			id: "s",
			userId: "u",
			events: [],
		} as Session;

		const ctx = (runner as any)._newInvocationContext(session, {
			newMessage: "" as any,
		});
		expect(ctx.userContent).toBeNull();
	});
});
