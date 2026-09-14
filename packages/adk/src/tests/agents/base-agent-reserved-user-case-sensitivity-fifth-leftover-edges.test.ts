import { describe, expect, it, vi } from "vitest";
import { BaseAgent } from "../../agents/base-agent";
import type { InvocationContext } from "../../agents/invocation-context";
import { Event } from "../../events/event";

class TestAgent extends BaseAgent {
	protected async *runAsyncImpl(
		_ctx: InvocationContext,
	): AsyncGenerator<Event, void, unknown> {
		yield new Event({
			author: this.name,
			content: { parts: [{ text: "ok" }] },
		});
	}

	protected async *runLiveImpl(
		_ctx: InvocationContext,
	): AsyncGenerator<Event, void, unknown> {
		yield new Event({
			author: this.name,
			content: { parts: [{ text: "live" }] },
		});
	}
}

describe("BaseAgent reserved user name case sensitivity fifth leftover", () => {
	it("rejects exact lowercase user only", () => {
		expect(() => new TestAgent({ name: "user" })).toThrow(
			"Agent name cannot be `user`",
		);
	});

	it.each([
		{ label: "User", name: "User" },
		{ label: "USER", name: "USER" },
		{ label: "uSer", name: "uSer" },
		{ label: "user_", name: "user_" },
		{ label: "_user", name: "_user" },
	])('$label passes reserved check (strict === "user" only)', ({ name }) => {
		const agent = new TestAgent({ name });
		expect(agent.name).toBe(name);
	});

	it("findAgent is also case-sensitive for reserved-adjacent names", () => {
		vi.clearAllMocks();
		const agent = new TestAgent({ name: "User" });
		expect(agent.findAgent("User")).toBe(agent);
		expect(agent.findAgent("user")).toBeUndefined();
		expect(agent.findAgent("USER")).toBeUndefined();
	});
});
