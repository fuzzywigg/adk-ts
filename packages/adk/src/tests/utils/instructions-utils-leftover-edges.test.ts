import { beforeEach, describe, expect, it } from "vitest";
import type { InvocationContext } from "../../agents/invocation-context";
import { ReadonlyContext } from "../../agents/readonly-context";
import { injectSessionState } from "../../utils/instructions-utils";

describe("instructions-utils optional {var?} throw leftovers", () => {
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

	function throwingState(throwsOn: string | string[]): Record<string, unknown> {
		const keys = Array.isArray(throwsOn) ? throwsOn : [throwsOn];
		return new Proxy(
			{ safe: "ok", nested: { safe: "n" } },
			{
				get(target, prop, receiver) {
					if (typeof prop === "string" && keys.includes(prop)) {
						throw new Error(`boom:${prop}`);
					}
					return Reflect.get(target, prop, receiver);
				},
			},
		) as Record<string, unknown>;
	}

	function nestedThrowingState(): Record<string, unknown> {
		return {
			user: new Proxy(
				{ name: "Alice" },
				{
					get(target, prop, receiver) {
						if (prop === "secret") {
							throw new Error("nested-boom");
						}
						return Reflect.get(target, prop, receiver);
					},
				},
			),
		};
	}

	it("optional root recovers to empty string when lookup throws", async () => {
		mockContext.session.state = throwingState("fragile");
		const result = await injectSessionState(
			"Hello {fragile?}!",
			readonlyContext,
		);
		expect(result).toBe("Hello !");
	});

	it("required root still rethrows when lookup throws", async () => {
		mockContext.session.state = throwingState("fragile");
		await expect(
			injectSessionState("Hello {fragile}!", readonlyContext),
		).rejects.toThrow("boom:fragile");
	});

	it("optional nested path recovers when getNestedValue throws", async () => {
		mockContext.session.state = nestedThrowingState();
		const result = await injectSessionState(
			"X={user.secret?}",
			readonlyContext,
		);
		expect(result).toBe("X=");
	});

	it("required nested path rethrows when getNestedValue throws", async () => {
		mockContext.session.state = nestedThrowingState();
		await expect(
			injectSessionState("X={user.secret}", readonlyContext),
		).rejects.toThrow("nested-boom");
	});

	const optionalMatrix: Array<{
		label: string;
		template: string;
		state: () => Record<string, unknown>;
		expected: string;
	}> = [
		{
			label: "optional root throw among literals",
			template: "A:{a?} B:{safe} C:{c?}",
			state: () => throwingState(["a", "c"]),
			expected: "A: B:ok C:",
		},
		{
			label: "optional nested throw with present sibling",
			template: "{user.name} / {user.secret?}",
			state: () => nestedThrowingState(),
			expected: "Alice / ",
		},
		{
			label: "multiple optional throws",
			template: "{x?}{y?}{z?}",
			state: () => throwingState(["x", "y", "z"]),
			expected: "",
		},
		{
			label: "optional throw then required present",
			template: "{bad?} then {safe}",
			state: () => throwingState("bad"),
			expected: " then ok",
		},
		{
			label: "optional nested mid-path throw via proxy root",
			template: "V={basket.fruits?}",
			state: () =>
				new Proxy(
					{},
					{
						get(_t, prop) {
							if (prop === "basket") {
								throw new Error("basket-boom");
							}
							return undefined;
						},
					},
				) as Record<string, unknown>,
			expected: "V=",
		},
	];

	for (const { label, template, state, expected } of optionalMatrix) {
		it(`matrix optional recover: ${label}`, async () => {
			mockContext.session.state = state();
			const result = await injectSessionState(template, readonlyContext);
			expect(result).toBe(expected);
		});
	}

	const requiredRethrowMatrix: Array<{
		label: string;
		template: string;
		state: () => Record<string, unknown>;
		message: RegExp;
	}> = [
		{
			label: "required root throw",
			template: "{fragile}",
			state: () => throwingState("fragile"),
			message: /boom:fragile/,
		},
		{
			label: "required nested throw",
			template: "{user.secret}",
			state: () => nestedThrowingState(),
			message: /nested-boom/,
		},
		{
			label: "required after optional success still throws",
			template: "{safe?} then {fragile}",
			state: () => throwingState("fragile"),
			message: /boom:fragile/,
		},
	];

	for (const { label, template, state, message } of requiredRethrowMatrix) {
		it(`matrix required rethrow: ${label}`, async () => {
			mockContext.session.state = state();
			await expect(
				injectSessionState(template, readonlyContext),
			).rejects.toThrow(message);
		});
	}

	it("optional recovers even when throw happens on bracket nested access", async () => {
		mockContext.session.state = {
			items: new Proxy(["a"], {
				get(target, prop, receiver) {
					if (prop === "0") {
						throw new Error("index-boom");
					}
					return Reflect.get(target, prop, receiver);
				},
			}),
		};
		const result = await injectSessionState(
			"Item={items[0]?}",
			readonlyContext,
		);
		expect(result).toBe("Item=");
	});
});
