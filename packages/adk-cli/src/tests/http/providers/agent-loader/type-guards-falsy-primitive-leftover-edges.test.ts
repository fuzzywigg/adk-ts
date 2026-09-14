import { describe, expect, it } from "vitest";
import { TypeGuards } from "../../../../http/providers/agent-loader/type-guards";

/**
 * Leftover: typeof name === "string" accepts ""; isPrimitive keeps 0/false/""/NaN;
 * isBuiltAgent uses `in` (truthiness-agnostic).
 */
describe("TypeGuards falsy primitive leftover edges", () => {
	const guards = new TypeGuards();

	it("isPrimitive accepts falsy string/number/boolean and NaN", () => {
		expect(guards.isPrimitive(0)).toBe(true);
		expect(guards.isPrimitive(false)).toBe(true);
		expect(guards.isPrimitive("")).toBe(true);
		expect(guards.isPrimitive(Number.NaN)).toBe(true);
		expect(guards.isPrimitive(undefined)).toBe(true);
		expect(guards.isPrimitive(1n)).toBe(false);
		expect(guards.isPrimitive(Symbol("x"))).toBe(false);
		expect(guards.isPrimitive(() => undefined)).toBe(false);
	});

	it("isLikelyAgentInstance accepts empty-string name", () => {
		expect(
			guards.isLikelyAgentInstance({
				name: "",
				runAsync: async () => undefined,
			}),
		).toBe(true);
	});

	it("isLikelyAgentInstance rejects numeric name 0", () => {
		expect(
			guards.isLikelyAgentInstance({
				name: 0,
				runAsync: async () => undefined,
			}),
		).toBe(false);
	});

	it("isBuiltAgent accepts falsy agent/runner/session values via `in`", () => {
		expect(guards.isBuiltAgent({ agent: 0, runner: 0, session: 0 })).toBe(true);
		expect(
			guards.isBuiltAgent({ agent: "", runner: false, session: null }),
		).toBe(true);
	});
});
