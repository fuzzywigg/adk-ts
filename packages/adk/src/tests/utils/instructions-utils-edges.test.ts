import { beforeEach, describe, expect, it } from "vitest";
import type { InvocationContext } from "../../agents/invocation-context";
import { ReadonlyContext } from "../../agents/readonly-context";
import { injectSessionState } from "../../utils/instructions-utils";

describe("instructions-utils leftover edges (TOKENMAXX post #124)", () => {
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

	it("swallows formatValue/JSON.stringify failures for optional state vars", async () => {
		const circular: Record<string, unknown> = { ok: true };
		circular.self = circular;
		mockContext.session.state = { circ: circular };

		const result = await injectSessionState("X={circ?}", readonlyContext);
		expect(result).toBe("X=");
	});

	it("still throws for required circular state vars", async () => {
		const circular: Record<string, unknown> = { ok: true };
		circular.self = circular;
		mockContext.session.state = { circ: circular };

		await expect(
			injectSessionState("X={circ}", readonlyContext),
		).rejects.toThrow();
	});
});
