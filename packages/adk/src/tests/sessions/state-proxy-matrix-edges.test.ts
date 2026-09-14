import { describe, expect, it } from "vitest";
import { State } from "../../sessions/state";

describe("State proxy matrix leftover edges", () => {
	it("prefers delta over value for get, bracket access, and has", () => {
		const state = State.create({ k: "v" }, { k: "d" });
		expect(state.get("k")).toBe("d");
		expect(state["k"]).toBe("d");
		expect(state.has("k")).toBe(true);
		expect(state.toDict()).toEqual({ k: "d" });
	});

	it("returns defaults only when neither value nor delta has the key", () => {
		const state = State.create({}, { pending: 1 });
		expect(state.get("pending", "fallback")).toBe(1);
		expect(state.get("missing", "fallback")).toBe("fallback");
		expect(state.get("missing")).toBeUndefined();
	});

	it("set writes through both value and delta maps", () => {
		const value: Record<string, any> = {};
		const delta: Record<string, any> = {};
		const state = State.create(value, delta);
		state.set("x", 1);
		expect(value.x).toBe(1);
		expect(delta.x).toBe(1);
		expect(state.hasDelta()).toBe(true);
	});

	it("update merges overlapping keys with delta winning in toDict", () => {
		const state = State.create({ a: 1, b: 2 }, { b: 9 });
		state.update({ a: 5, c: 3 });
		expect(state.toDict()).toEqual({ a: 5, b: 9, c: 3 });
	});

	it("proxy set for underscore keys does not create state delta entries", () => {
		const state = State.create({}, {});
		(state as any)._marker = true;
		expect((state as any)._marker).toBe(true);
		expect(state.hasDelta()).toBe(false);
		expect(state.toDict()).toEqual({});
	});

	it("symbol keys bypass string-key state routing", () => {
		const state = State.create({}, {});
		const sym = Symbol("s");
		(state as any)[sym] = "secret";
		expect((state as any)[sym]).toBe("secret");
		expect(state.hasDelta()).toBe(false);
		expect(sym in state).toBe(true);
	});

	it("method names remain callable even when state stores colliding keys", () => {
		const state = State.create({ has: "shadow", toDict: "shadow" }, {});
		expect(typeof state.has).toBe("function");
		expect(typeof state.toDict).toBe("function");
		expect(state.has("has")).toBe(true);
		expect(state.toDict().has).toBe("shadow");
		expect(state.toDict().toDict).toBe("shadow");
	});

	it("supports APP/USER/TEMP prefix keys via set and proxy assignment", () => {
		const state = State.create({}, {});
		const app = `${State.APP_PREFIX}theme`;
		const user = `${State.USER_PREFIX}locale`;
		const temp = `${State.TEMP_PREFIX}scratch`;
		state.set(app, "dark");
		state[user] = "en";
		state[temp] = { draft: true };
		expect(state.toDict()).toEqual({
			[app]: "dark",
			[user]: "en",
			[temp]: { draft: true },
		});
		expect(app in state).toBe(true);
		expect(user in state).toBe(true);
		expect(temp in state).toBe(true);
	});

	it("empty-string and whitespace keys are valid state keys", () => {
		const state = State.create({}, {});
		state.set("", "empty");
		state[" "] = "space";
		expect(state.get("")).toBe("empty");
		expect(state.get(" ")).toBe("space");
		expect(state.toDict()).toEqual({ "": "empty", " ": "space" });
	});

	it("raw State without proxy does not route bracket assignment through set", () => {
		const raw = new State({}, {});
		raw["x"] = 1;
		expect(raw.has("x")).toBe(false);
		raw.set("x", 1);
		expect(raw.has("x")).toBe(true);
		expect(raw.hasDelta()).toBe(true);
	});

	it("update with empty object leaves existing delta intact", () => {
		const state = State.create({}, { pending: true });
		state.update({});
		expect(state.hasDelta()).toBe(true);
		expect(state.get("pending")).toBe(true);
	});

	it("nested objects are stored by reference through set", () => {
		const nested = { n: 1 };
		const state = State.create({}, {});
		state.set("obj", nested);
		nested.n = 2;
		expect(state.get("obj").n).toBe(2);
	});

	it("hasDelta is false for populated value with empty delta", () => {
		const state = State.create({ a: 1, b: 2 }, {});
		expect(state.hasDelta()).toBe(false);
		state.set("a", 1);
		expect(state.hasDelta()).toBe(true);
	});

	it("create returns a State instance with independent proxy identity", () => {
		const state = State.create({ a: 1 }, {});
		expect(state).toBeInstanceOf(State);
		expect(state.get("a")).toBe(1);
	});
});
