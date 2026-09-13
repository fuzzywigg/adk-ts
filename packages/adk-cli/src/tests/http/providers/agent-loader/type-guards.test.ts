import { describe, expect, it } from "vitest";
import { TypeGuards } from "../../../../http/providers/agent-loader/type-guards";

describe("TypeGuards", () => {
	const guards = new TypeGuards();

	it("detects agent-like instances", () => {
		expect(
			guards.isLikelyAgentInstance({
				name: "agent",
				runAsync: async () => undefined,
			}),
		).toBe(true);
		expect(guards.isLikelyAgentInstance({ name: "agent" })).toBe(false);
		expect(guards.isLikelyAgentInstance(null)).toBe(false);
	});

	it("detects agent builders", () => {
		expect(
			guards.isAgentBuilder({
				build: () => undefined,
				withModel: () => undefined,
			}),
		).toBe(true);
		expect(guards.isAgentBuilder({ build: () => undefined })).toBe(false);
	});

	it("detects built agents", () => {
		expect(guards.isBuiltAgent({ agent: {}, runner: {}, session: {} })).toBe(
			true,
		);
		expect(guards.isBuiltAgent({ agent: {}, runner: {} })).toBe(false);
	});

	it("detects primitives", () => {
		expect(guards.isPrimitive(null)).toBe(true);
		expect(guards.isPrimitive("x")).toBe(true);
		expect(guards.isPrimitive(1)).toBe(true);
		expect(guards.isPrimitive(true)).toBe(true);
		expect(guards.isPrimitive({})).toBe(false);
	});
});
