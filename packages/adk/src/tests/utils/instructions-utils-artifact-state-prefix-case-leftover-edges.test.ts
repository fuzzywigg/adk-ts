import { beforeEach, describe, expect, it } from "vitest";
import type { InvocationContext } from "../../agents/invocation-context";
import { ReadonlyContext } from "../../agents/readonly-context";
import { injectSessionState } from "../../utils/instructions-utils";

describe("instructions-utils artifact./state-prefix case leftover (post #168)", () => {
	let mockContext: InvocationContext;
	let readonlyContext: ReadonlyContext;

	beforeEach(() => {
		mockContext = {
			session: {
				id: "test-session",
				appName: "test-app",
				userId: "test-user",
				state: {
					report: "from-state",
					"app:mode": "prod",
					"user:name": "alice",
					"temp:nonce": "n1",
				},
			},
			artifactService: {
				loadArtifact: async () => "loaded-artifact",
			},
		} as any;
		readonlyContext = new ReadonlyContext(mockContext);
	});

	it.each([
		{ label: "Artifact.", varName: "Artifact.report" },
		{ label: "ARTIFACT.", varName: "ARTIFACT.report" },
		{ label: "Artifact mixed", varName: "ArTiFaCt.report" },
	])("$label skips artifact. path and falls through to nested state lookup", async ({
		varName,
	}) => {
		const loadArtifact = async () => "loaded-artifact";
		const spyService = {
			loadArtifact: async (...args: unknown[]) => {
				(spyService as any).calls = ((spyService as any).calls ?? 0) + 1;
				return loadArtifact(...args);
			},
			calls: 0,
		};
		mockContext.artifactService = spyService as any;

		await expect(
			injectSessionState(`X={${varName}}`, readonlyContext),
		).rejects.toThrow(`Context variable not found: \`${varName}\``);
		expect(spyService.calls).toBe(0);
	});

	it("wrong-case Artifact. optional recovers without calling artifactService", async () => {
		let calls = 0;
		mockContext.artifactService = {
			loadArtifact: async () => {
				calls += 1;
				return "loaded-artifact";
			},
		} as any;
		const result = await injectSessionState(
			"X={Artifact.report?}",
			readonlyContext,
		);
		expect(result).toBe("X=");
		expect(calls).toBe(0);
	});

	it("lowercase artifact. still loads via artifactService", async () => {
		const result = await injectSessionState(
			"X={artifact.report}",
			readonlyContext,
		);
		expect(result).toBe("X=loaded-artifact");
	});

	it.each([
		{ label: "App:", template: "{App:mode}" },
		{ label: "USER:", template: "{USER:name}" },
		{ label: "Temp:", template: "{Temp:nonce}" },
		{ label: "APP:", template: "{APP:mode}" },
		{ label: "User:", template: "{User:name}" },
		{ label: "TEMP:", template: "{TEMP:nonce}" },
	])("$label prefix fails isValidStateName and returns raw placeholder", async ({
		template,
	}) => {
		const result = await injectSessionState(template, readonlyContext);
		expect(result).toBe(template);
	});

	it("exact app:/user:/temp: prefixes still resolve", async () => {
		const result = await injectSessionState(
			"{app:mode}/{user:name}/{temp:nonce}",
			readonlyContext,
		);
		expect(result).toBe("prod/alice/n1");
	});
});
