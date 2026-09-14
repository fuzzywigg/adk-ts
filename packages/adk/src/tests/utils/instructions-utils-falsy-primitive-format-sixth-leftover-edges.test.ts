import { beforeEach, describe, expect, it } from "vitest";
import type { InvocationContext } from "../../agents/invocation-context";
import { ReadonlyContext } from "../../agents/readonly-context";
import { injectSessionState } from "../../utils/instructions-utils";

describe("instructions-utils formatValue falsy primitives sixth leftover", () => {
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
		{ label: "empty string", value: "", expected: "" },
		{ label: "zero", value: 0, expected: "0" },
		{ label: "false", value: false, expected: "false" },
		{ label: "null", value: null, expected: "null" },
	])("$label injects via formatValue (not === undefined throw)", async ({
		value,
		expected,
	}) => {
		mockContext.session.state = { n: value };
		expect(await injectSessionState("X={n}", readonlyContext)).toBe(
			`X=${expected}`,
		);
	});

	it("undefined required still throws", async () => {
		mockContext.session.state = { n: undefined };
		await expect(injectSessionState("X={n}", readonlyContext)).rejects.toThrow(
			/Context variable not found/,
		);
	});

	it("optional ? recovers only undefined, not null", async () => {
		mockContext.session.state = { n: null };
		expect(await injectSessionState("X={n?}", readonlyContext)).toBe("X=null");
		mockContext.session.state = {};
		expect(await injectSessionState("X={missing?}", readonlyContext)).toBe(
			"X=",
		);
	});
});
