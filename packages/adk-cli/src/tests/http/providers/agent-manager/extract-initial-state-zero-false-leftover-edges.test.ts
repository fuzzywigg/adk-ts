import type { BaseAgent, BuiltAgent } from "@iqai/adk";
import { describe, expect, it, vi } from "vitest";
import { extractInitialState } from "../../../../http/providers/agent-manager/state";

/**
 * Leftover: non-empty objects/Maps keep falsy values; sessionService: undefined
 * still passes `in` check; non-array subAgents skipped.
 */
describe("extractInitialState zero/false leftover edges", () => {
	it("keeps builtAgent state with count 0 / flag false", () => {
		const builtAgent = {
			session: { state: { count: 0, flag: false, name: "" } },
		} as unknown as BuiltAgent;
		expect(
			extractInitialState({
				agent: { name: "root" } as BaseAgent,
				builtAgent,
			}),
		).toEqual({ count: 0, flag: false, name: "" });
	});

	it("keeps Map entries whose values are 0 or empty string", () => {
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
									[
										"s1",
										{
											state: new Map([
												["n", 0],
												["s", ""],
											]),
										},
									],
								]),
							],
						]),
					],
				]),
			},
		} as unknown as BaseAgent;
		expect(extractInitialState({ agent })).toEqual({ n: 0, s: "" });
	});

	it("hasSessionService true for sessionService: undefined then yields nothing", () => {
		const agent = {
			name: "root",
			sessionService: undefined,
		} as unknown as BaseAgent;
		expect(extractInitialState({ agent })).toBeUndefined();
	});

	it("skips non-array subAgents without throwing", () => {
		const agent = {
			name: "root",
			subAgents: { not: "array" },
		} as unknown as BaseAgent;
		expect(
			extractInitialState({ agent }, { log: vi.fn() } as never),
		).toBeUndefined();
	});

	it("skips subAgents undefined", () => {
		const agent = {
			name: "root",
			subAgents: undefined,
		} as unknown as BaseAgent;
		expect(extractInitialState({ agent })).toBeUndefined();
	});
});
