import { beforeEach, describe, expect, it } from "vitest";
import type { InvocationContext } from "../../agents/invocation-context";
import { ReadonlyContext } from "../../agents/readonly-context";
import { injectSessionState } from "../../utils/instructions-utils";

describe("instructions-utils remainder edges (TOKENMAXX deepen)", () => {
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

	it("resolves nested optional under app:/user:/temp: roots", async () => {
		mockContext.session.state = {
			"app:config": { theme: "dark" },
			"user:profile": { city: "Oslo" },
			"temp:cache": { hit: true },
		};

		const result = await injectSessionState(
			"{app:config.theme?}/{user:profile.city?}/{temp:cache.hit?}",
			readonlyContext,
		);
		expect(result).toBe("dark/Oslo/true");
	});

	it("optional nested miss under prefixed roots becomes empty", async () => {
		mockContext.session.state = {
			"app:config": { theme: "dark" },
			"user:profile": {},
		};

		const result = await injectSessionState(
			"T={app:config.missing?} C={user:profile.city?}",
			readonlyContext,
		);
		expect(result).toBe("T= C=");
	});

	it("leaves invalid optional roots as literal placeholders", async () => {
		const result = await injectSessionState(
			"X={123?} Y={foo:bar?} Z={ok?}",
			readonlyContext,
		);
		expect(result).toBe("X={123?} Y={foo:bar?} Z=");
	});

	it("combines artifact injection with optional state miss in one template", async () => {
		mockContext.artifactService = {
			loadArtifact: async () => "FILE",
		} as any;
		mockContext.session.state = { present: "yes" };

		const result = await injectSessionState(
			"{present}/{artifact.doc}/{missing?}",
			readonlyContext,
		);
		expect(result).toBe("yes/FILE/");
	});

	it("required prefixed nested path throws when intermediate is missing", async () => {
		mockContext.session.state = { "user:profile": {} };
		await expect(
			injectSessionState("{user:profile.city}", readonlyContext),
		).rejects.toThrow();
	});

	it("injects bracket paths under prefixed object state", async () => {
		mockContext.session.state = {
			"temp:list": [{ id: "a" }, { id: "b" }],
		};
		const result = await injectSessionState(
			"{temp:list[1].id}",
			readonlyContext,
		);
		expect(result).toBe("b");
	});

	it("optional artifact miss coexists with required state", async () => {
		mockContext.session.state = { name: "Ada" };
		mockContext.artifactService = {
			loadArtifact: async () => null,
		} as any;

		const result = await injectSessionState(
			"Hi {name} {artifact.gone?}",
			readonlyContext,
		);
		expect(result).toBe("Hi Ada ");
	});
});
