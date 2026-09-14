import { beforeEach, describe, expect, it } from "vitest";
import type { InvocationContext } from "../../agents/invocation-context";
import { ReadonlyContext } from "../../agents/readonly-context";
import { injectSessionState } from "../../utils/instructions-utils";

describe("instructions-utils matrix edges (TOKENMAXX leftovers)", () => {
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

	it("swallows formatValue throws for optional state variables with circular objects", async () => {
		const circular: Record<string, unknown> = { name: "loop" };
		circular.self = circular;
		mockContext.session.state = { basket: circular };

		await expect(
			injectSessionState("X={basket?}", readonlyContext),
		).resolves.toBe("X=");
	});

	it("still throws for required circular state variables", async () => {
		const circular: Record<string, unknown> = { name: "loop" };
		circular.self = circular;
		mockContext.session.state = { basket: circular };

		await expect(
			injectSessionState("X={basket}", readonlyContext),
		).rejects.toThrow();
	});

	it.each([
		{ label: "root optional", template: "{loop?}", key: "loop" },
		{
			label: "prefixed optional",
			template: "{user:profile?}",
			key: "user:profile",
		},
	])("returns empty for optional $label when JSON.stringify throws", async ({
		template,
		key,
	}) => {
		const circular: Record<string, unknown> = {};
		circular.self = circular;
		mockContext.session.state = { [key]: circular };

		await expect(
			injectSessionState(`out=${template}`, readonlyContext),
		).resolves.toBe("out=");
	});
});
