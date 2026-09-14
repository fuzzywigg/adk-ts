import { describe, expect, it } from "vitest";
import { Event } from "../../events/event";
import { EventActions } from "../../events/event-actions";

describe("Event id ?? newId empty-string preserve fifth leftover", () => {
	it("empty-string id is preserved via ?? (unlike InvocationContext ||)", () => {
		const event = new Event({ author: "agent", id: "" });
		expect(event.id).toBe("");
	});

	it.each([
		{ label: "null", value: null },
		{ label: "undefined", value: undefined },
	])("$label id regenerates via ??", ({ value }) => {
		const event = new Event({ author: "agent", id: value as any });
		expect(event.id).toMatch(/^[a-f0-9]{8}$/);
	});

	it("falsy non-nullish id 0 / false / NaN are preserved via ??", () => {
		expect(new Event({ author: "a", id: 0 as any }).id).toBe(0);
		expect(new Event({ author: "a", id: false as any }).id).toBe(false);
		expect(
			Number.isNaN(new Event({ author: "a", id: Number.NaN as any }).id),
		).toBe(true);
	});

	it("non-empty id is preserved", () => {
		expect(new Event({ author: "a", id: "abc12345" }).id).toBe("abc12345");
	});
});

describe("Event actions ?? asymmetry fifth leftover", () => {
	it("null actions mints a fresh EventActions via ??", () => {
		const event = new Event({ author: "agent", actions: null as any });
		expect(event.actions).toBeInstanceOf(EventActions);
		expect(event.actions.stateDelta).toEqual({});
	});

	it.each([
		{ label: "false", value: false },
		{ label: "0", value: 0 },
		{ label: "empty-string", value: "" },
	])("$label actions is preserved via ?? (unlike EventActions stateDelta ||)", ({
		value,
	}) => {
		const event = new Event({ author: "agent", actions: value as any });
		expect(event.actions).toBe(value);
	});

	it("undefined actions mints EventActions", () => {
		const event = new Event({ author: "agent", actions: undefined });
		expect(event.actions).toBeInstanceOf(EventActions);
	});

	it("provided EventActions instance is preserved by reference", () => {
		const actions = new EventActions({ escalate: true });
		expect(new Event({ author: "a", actions }).actions).toBe(actions);
	});
});
