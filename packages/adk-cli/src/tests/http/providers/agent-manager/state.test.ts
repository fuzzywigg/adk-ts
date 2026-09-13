import type { BaseAgent, BuiltAgent } from "@iqai/adk";
import { describe, expect, it, vi } from "vitest";
import { extractInitialState } from "../../../../http/providers/agent-manager/state";

describe("extractInitialState", () => {
	it("prefers non-empty builtAgent.session.state", () => {
		const agent = { name: "root" } as BaseAgent;
		const builtAgent = {
			session: { state: { theme: "dark", count: 1 } },
		} as unknown as BuiltAgent;

		expect(extractInitialState({ agent, builtAgent })).toEqual({
			theme: "dark",
			count: 1,
		});
	});

	it("ignores empty builtAgent.session.state and falls through", () => {
		const agent = {
			name: "root",
			sessionService: {
				sessions: new Map([
					[
						"app",
						new Map([
							["user", new Map([["s1", { state: { fromSession: true } }]])],
						]),
					],
				]),
			},
		} as unknown as BaseAgent;
		const builtAgent = { session: { state: {} } } as unknown as BuiltAgent;

		expect(extractInitialState({ agent, builtAgent })).toEqual({
			fromSession: true,
		});
	});

	it("extracts state from nested Map sessionService", () => {
		const agent = {
			name: "root",
			sessionService: {
				sessions: new Map([
					[
						"app",
						new Map([
							[
								"user",
								new Map([
									["empty", { state: {} }],
									["filled", { state: new Map([["k", "v"]]) }],
								]),
							],
						]),
					],
				]),
			},
		} as unknown as BaseAgent;

		expect(extractInitialState({ agent })).toEqual({ k: "v" });
	});

	it("falls back to sub-agent sessionService state", () => {
		const logger = { log: vi.fn() };
		const subAgent = {
			name: "child",
			sessionService: {
				sessions: new Map([
					[
						"app",
						new Map([["user", new Map([["s1", { state: { nested: true } }]])]]),
					],
				]),
			},
		};
		const agent = {
			name: "root",
			subAgents: [subAgent],
		} as unknown as BaseAgent;

		expect(extractInitialState({ agent }, logger as never)).toEqual({
			nested: true,
		});
		expect(logger.log).toHaveBeenCalled();
	});

	it("returns undefined when no state sources exist", () => {
		const agent = { name: "root" } as BaseAgent;
		expect(extractInitialState({ agent })).toBeUndefined();
	});

	it("ignores empty Map/object states and sub-agents without usable state", () => {
		const agent = {
			name: "root",
			sessionService: {
				sessions: new Map([
					["app", new Map([["user", new Map([["s1", { state: new Map() }]])]])],
				]),
			},
			subAgents: [
				{ name: "child-no-service" },
				{
					name: "child-empty",
					sessionService: {
						sessions: new Map([
							["app", new Map([["user", new Map([["s1", { state: {} }]])]])],
						]),
					},
				},
			],
		} as unknown as BaseAgent;

		expect(extractInitialState({ agent })).toBeUndefined();
	});

	it("prefers builtAgent state over agent sessionService", () => {
		const agent = {
			name: "root",
			sessionService: {
				sessions: new Map([
					[
						"app",
						new Map([["user", new Map([["s1", { state: { fromAgent: 1 } }]])]]),
					],
				]),
			},
		} as unknown as BaseAgent;
		const builtAgent = {
			session: { state: { fromBuilt: true } },
		} as unknown as BuiltAgent;

		expect(extractInitialState({ agent, builtAgent })).toEqual({
			fromBuilt: true,
		});
	});

	it("skips builtAgent when session is missing", () => {
		const agent = {
			name: "root",
			sessionService: {
				sessions: new Map([
					[
						"app",
						new Map([["user", new Map([["s1", { state: { recovered: 1 } }]])]]),
					],
				]),
			},
		} as unknown as BaseAgent;

		expect(
			extractInitialState({
				agent,
				builtAgent: {} as BuiltAgent,
			}),
		).toEqual({ recovered: 1 });
	});
});
