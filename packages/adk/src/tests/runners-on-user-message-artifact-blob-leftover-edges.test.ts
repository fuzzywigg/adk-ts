import { beforeEach, describe, expect, it, vi } from "vitest";
import { LlmAgent } from "../agents/llm-agent";
import type { InvocationContext } from "../agents/invocation-context";
import { RunConfig } from "../agents/run-config";
import { InMemoryArtifactService } from "../artifacts/in-memory-artifact-service";
import { Event } from "../events/event";
import { BasePlugin } from "../plugins/base-plugin";
import { Runner } from "../runners";
import { InMemorySessionService } from "../sessions/in-memory-session-service";

class InjectBlobPlugin extends BasePlugin {
	constructor(
		private readonly mutate: (userMessage: {
			role?: string;
			parts?: any[];
		}) => { role?: string; parts?: any[] },
	) {
		super("inject-blob");
	}

	override async onUserMessageCallback(params: {
		invocationContext: InvocationContext;
		userMessage: any;
	}): Promise<any> {
		return this.mutate(params.userMessage);
	}
}

describe("Runner sixth leftover: onUserMessage × artifact blobs (post #151)", () => {
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
				content: { role: "model", parts: [{ text: "done" }] },
			});
		});
	});

	it("onUserMessage-injected inlineData is saved when saveInputBlobsAsArtifacts is true", async () => {
		await sessionService.createSession(
			"runner-blob-app",
			"u1",
			{},
			"s-inject-save",
		);
		const saveSpy = vi.spyOn(artifactService, "saveArtifact");
		const runner = new Runner({
			appName: "runner-blob-app",
			agent,
			sessionService,
			artifactService,
			plugins: [
				new InjectBlobPlugin((msg) => ({
					...msg,
					parts: [
						...(msg.parts || []),
						{
							inlineData: {
								mimeType: "image/png",
								data: "aW5qZWN0ZWQ=",
							},
						},
					],
				})),
			],
		});

		for await (const _ of runner.runAsync({
			userId: "u1",
			sessionId: "s-inject-save",
			newMessage: { role: "user", parts: [{ text: "hello" }] },
			runConfig: new RunConfig({ saveInputBlobsAsArtifacts: true }),
		})) {
			/* drain */
		}

		expect(saveSpy).toHaveBeenCalledTimes(1);
		const session = await sessionService.getSession(
			"runner-blob-app",
			"u1",
			"s-inject-save",
		);
		const userEvent = session?.events.find((e) => e.author === "user");
		const texts = userEvent?.content?.parts?.map((p) => p.text);
		expect(texts?.some((t) => t?.startsWith("Uploaded file: artifact_"))).toBe(
			true,
		);
		expect(userEvent?.content?.parts?.some((p) => (p as any).inlineData)).toBe(
			false,
		);
	});

	it("onUserMessage-injected inlineData is kept when saveInputBlobsAsArtifacts is false", async () => {
		await sessionService.createSession(
			"runner-blob-app",
			"u1",
			{},
			"s-inject-keep",
		);
		const saveSpy = vi.spyOn(artifactService, "saveArtifact");
		const runner = new Runner({
			appName: "runner-blob-app",
			agent,
			sessionService,
			artifactService,
			plugins: [
				new InjectBlobPlugin((msg) => ({
					...msg,
					parts: [
						{
							inlineData: {
								mimeType: "text/plain",
								data: "a2VlcA==",
							},
						},
					],
				})),
			],
		});

		for await (const _ of runner.runAsync({
			userId: "u1",
			sessionId: "s-inject-keep",
			newMessage: { role: "user", parts: [{ text: "hello" }] },
			runConfig: new RunConfig({ saveInputBlobsAsArtifacts: false }),
		})) {
			/* drain */
		}

		expect(saveSpy).not.toHaveBeenCalled();
		const session = await sessionService.getSession(
			"runner-blob-app",
			"u1",
			"s-inject-keep",
		);
		const userEvent = session?.events.find((e) => e.author === "user");
		expect(userEvent?.content?.parts?.[0]).toMatchObject({
			inlineData: { mimeType: "text/plain", data: "a2VlcA==" },
		});
	});

	it("onUserMessage can strip inlineData before artifact save runs", async () => {
		await sessionService.createSession(
			"runner-blob-app",
			"u1",
			{},
			"s-strip-blob",
		);
		const saveSpy = vi.spyOn(artifactService, "saveArtifact");
		const runner = new Runner({
			appName: "runner-blob-app",
			agent,
			sessionService,
			artifactService,
			plugins: [
				new InjectBlobPlugin(() => ({
					role: "user",
					parts: [{ text: "stripped-to-text" }],
				})),
			],
		});

		for await (const _ of runner.runAsync({
			userId: "u1",
			sessionId: "s-strip-blob",
			newMessage: {
				role: "user",
				parts: [
					{
						inlineData: {
							mimeType: "application/octet-stream",
							data: "cmF3",
						},
					},
				],
			},
			runConfig: new RunConfig({ saveInputBlobsAsArtifacts: true }),
		})) {
			/* drain */
		}

		expect(saveSpy).not.toHaveBeenCalled();
		const session = await sessionService.getSession(
			"runner-blob-app",
			"u1",
			"s-strip-blob",
		);
		const userEvent = session?.events.find((e) => e.author === "user");
		expect(userEvent?.content?.parts).toEqual([{ text: "stripped-to-text" }]);
	});
});
