import { beforeEach, describe, expect, it, vi } from "vitest";
import { LlmAgent } from "../agents/llm-agent";
import { RunConfig } from "../agents/run-config";
import { InMemoryArtifactService } from "../artifacts/in-memory-artifact-service";
import { Event } from "../events/event";
import { BasePlugin } from "../plugins/base-plugin";
import { Runner } from "../runners";
import { InMemorySessionService } from "../sessions/in-memory-session-service";

class TruthyNonContentPlugin extends BasePlugin {
	constructor(private readonly value: unknown) {
		super("truthy-on-user-fourteenth");
	}

	override async onUserMessageCallback(): Promise<any> {
		return this.value;
	}
}

/**
 * Fourteenth leftover: `if (modifiedUserMessage)` residual after twelfth —
 * truthy non-Content assigns then blob-save path reads `.parts` → TypeError.
 * Without blob-save the spread path does not throw; contrast with `-0` keep.
 */
describe("runners on-user-message truthy non-Content TypeError fourteenth leftover", () => {
	let sessionService: InMemorySessionService;
	let artifactService: InMemoryArtifactService;
	let agent: LlmAgent;

	beforeEach(() => {
		sessionService = new InMemorySessionService();
		artifactService = new InMemoryArtifactService();
		agent = new LlmAgent({
			name: "root_agent",
			model: "gemini-2.0-flash-exp",
		});
		vi.spyOn(agent, "runAsync").mockImplementation(async function* () {
			yield new Event({
				author: "root_agent",
				content: { role: "model", parts: [{ text: "ok" }] },
			});
		});
	});

	it.each([
		{ label: "true", value: true },
		{ label: "string-true", value: "true" },
		{ label: "1", value: 1 },
		{ label: "empty-array", value: [] },
	])("onUserMessage $label + blob-save throws reading .parts", async ({
		value,
		label,
	}) => {
		const sessionId = `s-typeerror-${label}`;
		await sessionService.createSession(
			"runner-truthy-user-app",
			"u1",
			{},
			sessionId,
		);
		const runner = new Runner({
			appName: "runner-truthy-user-app",
			agent,
			sessionService,
			artifactService,
			plugins: [new TruthyNonContentPlugin(value)],
		});
		const runConfig = new RunConfig();
		(runConfig as any).saveInputBlobsAsArtifacts = true;

		await expect(async () => {
			for await (const _ of runner.runAsync({
				userId: "u1",
				sessionId,
				newMessage: {
					role: "user",
					parts: [{ inlineData: { mimeType: "text/plain", data: "Zg==" } }],
				},
				runConfig,
			})) {
			}
		}).rejects.toThrow();
	});

	it("empty-array without blob-save spreads into content (no .parts access)", async () => {
		await sessionService.createSession(
			"runner-truthy-user-app",
			"u1",
			{},
			"s-empty-array-spread",
		);
		const runner = new Runner({
			appName: "runner-truthy-user-app",
			agent,
			sessionService,
			plugins: [new TruthyNonContentPlugin([])],
		});

		for await (const _ of runner.runAsync({
			userId: "u1",
			sessionId: "s-empty-array-spread",
			newMessage: { role: "user", parts: [{ text: "keep-me" }] },
		})) {
		}

		const session = await sessionService.getSession(
			"runner-truthy-user-app",
			"u1",
			"s-empty-array-spread",
		);
		const userEvent = session?.events.find((e) => e.author === "user");
		expect(userEvent?.content?.role).toBe("user");
		expect(userEvent?.content?.parts).toBeUndefined();
	});

	it("-0 is falsy so original user text is kept (contrast)", async () => {
		await sessionService.createSession(
			"runner-truthy-user-app",
			"u1",
			{},
			"s-negzero",
		);
		const runner = new Runner({
			appName: "runner-truthy-user-app",
			agent,
			sessionService,
			plugins: [new TruthyNonContentPlugin(-0)],
		});

		for await (const _ of runner.runAsync({
			userId: "u1",
			sessionId: "s-negzero",
			newMessage: { role: "user", parts: [{ text: "keep-me" }] },
		})) {
		}

		const session = await sessionService.getSession(
			"runner-truthy-user-app",
			"u1",
			"s-negzero",
		);
		expect(
			session?.events.find((e) => e.author === "user")?.content?.parts?.[0]
				?.text,
		).toBe("keep-me");
	});
});
