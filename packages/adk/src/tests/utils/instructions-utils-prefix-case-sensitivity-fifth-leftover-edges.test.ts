import { beforeEach, describe, expect, it } from "vitest";
import type { InvocationContext } from "../../agents/invocation-context";
import { ReadonlyContext } from "../../agents/readonly-context";
import { injectSessionState } from "../../utils/instructions-utils";

describe("instructions-utils state prefix case sensitivity fifth leftover", () => {
	let mockContext: InvocationContext;
	let readonlyContext: ReadonlyContext;

	beforeEach(() => {
		mockContext = {
			session: {
				id: "test-session",
				appName: "test-app",
				userId: "test-user",
				state: {
					"user:name": "Alice",
					"app:mode": "prod",
					"temp:scratch": "tmp",
				},
			},
			artifactService: null,
		} as any;
		readonlyContext = new ReadonlyContext(mockContext);
	});

	it("exact lowercase prefixes resolve from session state", async () => {
		const result = await injectSessionState(
			"{user:name}/{app:mode}/{temp:scratch}",
			readonlyContext,
		);
		expect(result).toBe("Alice/prod/tmp");
	});

	it.each([
		{ label: "User:", template: "{User:name}", expected: "{User:name}" },
		{ label: "USER:", template: "{USER:name}", expected: "{USER:name}" },
		{ label: "APP:", template: "{APP:mode}", expected: "{APP:mode}" },
		{ label: "App:", template: "{App:mode}", expected: "{App:mode}" },
		{ label: "TEMP:", template: "{TEMP:scratch}", expected: "{TEMP:scratch}" },
		{ label: "Temp:", template: "{Temp:scratch}", expected: "{Temp:scratch}" },
	])("$label prefix is not in validPrefixes → left as literal", async ({
		template,
		expected,
	}) => {
		const result = await injectSessionState(template, readonlyContext);
		expect(result).toBe(expected);
	});

	it("mixed case prefixes leave tokens while lowercase still resolves", async () => {
		const result = await injectSessionState(
			"{User:name} vs {user:name} | {APP:mode} vs {app:mode}",
			readonlyContext,
		);
		expect(result).toBe("{User:name} vs Alice | {APP:mode} vs prod");
	});
});
