import { describe, expect, it } from "vitest";
import { LiveRequest } from "../../agents/live-request-queue";

describe("LiveRequest close || false fifth leftover", () => {
	it.each([
		{ label: "empty-string", value: "" as const },
		{ label: "null", value: null },
		{ label: "0", value: 0 as const },
		{ label: "false", value: false as const },
		{ label: "NaN", value: Number.NaN },
		{ label: "undefined", value: undefined },
	])("$label close coalesces to false via ||", ({ value }) => {
		expect(new LiveRequest({ close: value as any }).close).toBe(false);
	});

	it("explicit true is preserved", () => {
		expect(new LiveRequest({ close: true }).close).toBe(true);
	});

	it("truthy non-boolean close is preserved as-is", () => {
		expect(new LiveRequest({ close: 1 as any }).close).toBe(1);
		expect(new LiveRequest({ close: "yes" as any }).close).toBe("yes");
	});

	it("omitted options defaults close to false", () => {
		expect(new LiveRequest().close).toBe(false);
	});
});
