import { beforeEach, describe, expect, it } from "vitest";
import type { InvocationContext } from "../../agents/invocation-context";
import { ReadonlyContext } from "../../agents/readonly-context";
import { injectSessionState } from "../../utils/instructions-utils";

describe("instructions-utils leftover edges (post #124)", () => {
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

	it("returns empty string when optional var resolution throws", async () => {
		mockContext.session.state = new Proxy(
			{},
			{
				get() {
					throw new Error("proxy-boom");
				},
				has() {
					return true;
				},
			},
		);

		const result = await injectSessionState("X={foo?}", readonlyContext);
		expect(result).toBe("X=");
	});

	it("rethrows when required var resolution throws", async () => {
		mockContext.session.state = new Proxy(
			{ bar: 1 },
			{
				get(_t, prop) {
					if (prop === "foo") {
						throw new Error("required-boom");
					}
					return Reflect.get(_t, prop);
				},
				has(_t, prop) {
					return prop === "foo" || Reflect.has(_t, prop);
				},
			},
		);

		await expect(
			injectSessionState("X={foo}", readonlyContext),
		).rejects.toThrow(/required-boom/);
	});

	it("returns empty for optional nested access that throws mid-path", async () => {
		mockContext.session.state = {
			user: new Proxy(
				{},
				{
					get() {
						throw new TypeError("cannot read");
					},
				},
			),
		};

		const result = await injectSessionState("Hi {user.name?}", readonlyContext);
		expect(result).toBe("Hi ");
	});

	it("formats null via formatValue while undefined required still throws", async () => {
		mockContext.session.state = { a: null, b: undefined };
		expect(await injectSessionState("A={a}", readonlyContext)).toBe("A=null");
		await expect(injectSessionState("B={b}", readonlyContext)).rejects.toThrow(
			/Context variable not found/,
		);
	});

	it("optional undefined state key yields empty without calling formatValue", async () => {
		mockContext.session.state = { present: "yes" };
		expect(
			await injectSessionState("P={present} M={missing?}", readonlyContext),
		).toBe("P=yes M=");
	});
});
