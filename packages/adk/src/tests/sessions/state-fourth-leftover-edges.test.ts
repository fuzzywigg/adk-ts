import { describe, expect, it } from "vitest";
import { State } from "../../sessions/state";

describe("State fourth leftover delta/get/set matrices", () => {
	it("prefix constants are exact literals", () => {
		expect(State.APP_PREFIX).toBe("app:");
		expect(State.USER_PREFIX).toBe("user:");
		expect(State.TEMP_PREFIX).toBe("temp:");
	});

	const getMatrix: Array<{
		label: string;
		value: Record<string, any>;
		delta: Record<string, any>;
		key: string;
		defaultValue?: any;
		expected: any;
	}> = [
		{
			label: "from value",
			value: { a: 1 },
			delta: {},
			key: "a",
			expected: 1,
		},
		{
			label: "from delta",
			value: {},
			delta: { a: 2 },
			key: "a",
			expected: 2,
		},
		{
			label: "delta wins",
			value: { a: 1 },
			delta: { a: 9 },
			key: "a",
			expected: 9,
		},
		{
			label: "missing with default",
			value: {},
			delta: {},
			key: "missing",
			defaultValue: "fallback",
			expected: "fallback",
		},
		{
			label: "missing without default",
			value: {},
			delta: {},
			key: "missing",
			expected: undefined,
		},
		{
			label: "default ignored when value exists",
			value: { a: 0 },
			delta: {},
			key: "a",
			defaultValue: 99,
			expected: 0,
		},
		{
			label: "default ignored when delta exists",
			value: {},
			delta: { a: false },
			key: "a",
			defaultValue: true,
			expected: false,
		},
		{
			label: "null value",
			value: { a: null },
			delta: {},
			key: "a",
			expected: null,
		},
		{
			label: "empty string",
			value: { a: "" },
			delta: {},
			key: "a",
			expected: "",
		},
	];

	for (const row of getMatrix) {
		it(`get matrix: ${row.label}`, () => {
			const state = State.create(row.value, row.delta);
			expect(state.get(row.key, row.defaultValue)).toBe(row.expected);
		});
	}

	const setMatrix: Array<{
		label: string;
		key: string;
		value: any;
	}> = [
		{ label: "number", key: "n", value: 42 },
		{ label: "string", key: "s", value: "hi" },
		{ label: "bool", key: "b", value: true },
		{ label: "null", key: "z", value: null },
		{ label: "object", key: "o", value: { nested: 1 } },
		{ label: "array", key: "arr", value: [1, 2] },
		{ label: "app prefix", key: `${State.APP_PREFIX}theme`, value: "dark" },
		{ label: "user prefix", key: `${State.USER_PREFIX}locale`, value: "en" },
		{ label: "temp prefix", key: `${State.TEMP_PREFIX}scratch`, value: 1 },
	];

	for (const { label, key, value } of setMatrix) {
		it(`set matrix: ${label}`, () => {
			const valueMap: Record<string, any> = {};
			const deltaMap: Record<string, any> = {};
			const state = State.create(valueMap, deltaMap);
			state.set(key, value);
			expect(valueMap[key]).toEqual(value);
			expect(deltaMap[key]).toEqual(value);
			expect(state.get(key)).toEqual(value);
			expect(state.has(key)).toBe(true);
			expect(state.hasDelta()).toBe(true);
		});
	}

	it("has is true for value-only, delta-only, and both", () => {
		expect(State.create({ a: 1 }, {}).has("a")).toBe(true);
		expect(State.create({}, { b: 2 }).has("b")).toBe(true);
		expect(State.create({ c: 1 }, { c: 2 }).has("c")).toBe(true);
		expect(State.create({}, {}).has("missing")).toBe(false);
	});

	it("hasDelta false for empty delta and true after mutation", () => {
		const state = State.create({ keep: 1 }, {});
		expect(state.hasDelta()).toBe(false);
		state.update({ keep: 2 });
		expect(state.hasDelta()).toBe(true);
	});

	it("update merges keys and preserves unrelated delta", () => {
		const state = State.create({ a: 1 }, { b: 2 });
		state.update({ a: 3, c: 4 });
		expect(state.toDict()).toEqual({ a: 3, b: 2, c: 4 });
	});

	it("update with empty object does not clear existing delta", () => {
		const state = State.create({}, { pending: true });
		state.update({});
		expect(state.hasDelta()).toBe(true);
		expect(state.get("pending")).toBe(true);
	});

	it("toDict merges value then delta so delta wins", () => {
		const state = State.create({ a: 1, b: 2 }, { b: 9, c: 3 });
		expect(state.toDict()).toEqual({ a: 1, b: 9, c: 3 });
	});

	it("toDict empty when both maps empty", () => {
		expect(State.create({}, {}).toDict()).toEqual({});
	});

	it("proxy bracket get prefers delta", () => {
		const state = State.create({ a: "value" }, { a: "delta" });
		expect(state["a"]).toBe("delta");
	});

	it("proxy bracket set writes via set()", () => {
		const value: Record<string, any> = {};
		const delta: Record<string, any> = {};
		const state = State.create(value, delta);
		state["x"] = 10;
		expect(value.x).toBe(10);
		expect(delta.x).toBe(10);
	});

	it("proxy in-operator mirrors has()", () => {
		const state = State.create({ visible: 1 }, { pending: 2 });
		expect("visible" in state).toBe(true);
		expect("pending" in state).toBe(true);
		expect("absent" in state).toBe(false);
		expect("hasDelta" in state).toBe(true);
	});

	it("raw constructor supports has/hasDelta/toDict/set/update", () => {
		const raw = new State({ a: 1 }, { b: 2 });
		expect(raw.has("a")).toBe(true);
		expect(raw.has("b")).toBe(true);
		expect(raw.hasDelta()).toBe(true);
		expect(raw.toDict()).toEqual({ a: 1, b: 2 });
		raw.set("c", 3);
		expect(raw.toDict()).toEqual({ a: 1, b: 2, c: 3 });
		raw.update({ a: 9 });
		expect(raw.toDict().a).toBe(9);
	});

	it("set overwrites both value and delta for same key", () => {
		const state = State.create({ count: 0 }, { count: 1 });
		state.set("count", 5);
		expect(state.get("count")).toBe(5);
		expect(state.toDict()).toEqual({ count: 5 });
	});

	it("multiple sequential sets accumulate delta keys", () => {
		const state = State.create({}, {});
		state.set("a", 1);
		state.set("b", 2);
		state.set("c", 3);
		expect(state.toDict()).toEqual({ a: 1, b: 2, c: 3 });
		expect(state.hasDelta()).toBe(true);
	});

	it("prefixed keys coexist without collision", () => {
		const state = State.create({}, {});
		state.set(`${State.APP_PREFIX}k`, "app");
		state.set(`${State.USER_PREFIX}k`, "user");
		state.set(`${State.TEMP_PREFIX}k`, "temp");
		state.set("k", "session");
		expect(state.toDict()).toEqual({
			[`${State.APP_PREFIX}k`]: "app",
			[`${State.USER_PREFIX}k`]: "user",
			[`${State.TEMP_PREFIX}k`]: "temp",
			k: "session",
		});
	});
});
