import { beforeEach, describe, expect, it } from "vitest";
import type { InvocationContext } from "../../agents/invocation-context";
import { ReadonlyContext } from "../../agents/readonly-context";
import { injectSessionState } from "../../utils/instructions-utils";

/**
 * Sixth leftover: defined falsy primitives skip the `value === undefined`
 * throw and go through formatValue (`0`/`false`/`""` stringify; objects
 * pretty-print via JSON.stringify).
 */
describe("instructions-utils formatValue falsy primitive sixth leftover edges", () => {
	let mockContext: InvocationContext;
	let readonlyContext: ReadonlyContext;

	beforeEach(() => {
		mockContext = {
			session: {
				id: "test-session",
				appName: "test-app",
				userId: "test-user",
				state: {},
			},
			artifactService: null,
		} as any;
		readonlyContext = new ReadonlyContext(mockContext);
	});

	it.each([
		{ label: "0", value: 0, expected: "0" },
		{ label: "false", value: false, expected: "false" },
		{ label: '""', value: "", expected: "" },
		{ label: "NaN", value: Number.NaN, expected: "NaN" },
	] as const)("injects defined falsy $label via formatValue", async ({
		value,
		expected,
	}) => {
		mockContext.session.state = { v: value };
		expect(await injectSessionState("X={v}!", readonlyContext)).toBe(
			`X=${expected}!`,
		);
	});

	it("pretty-prints objects and arrays with JSON.stringify indent 2", async () => {
		mockContext.session.state = {
			obj: { a: 1 },
			arr: [1, 2],
		};
		const result = await injectSessionState("{obj}|{arr}", readonlyContext);
		expect(result).toBe(
			`${JSON.stringify({ a: 1 }, null, 2)}|${JSON.stringify([1, 2], null, 2)}`,
		);
	});

	it("optional marker is not needed when the value is defined empty string", async () => {
		mockContext.session.state = { empty: "" };
		expect(await injectSessionState("A={empty}B", readonlyContext)).toBe("AB");
	});
});
