import { describe, expect, it, vi } from "vitest";
import type { InvocationContext } from "../../../agents/invocation-context";
import { requestProcessor } from "../../../flows/llm-flows/basic";
import { LlmRequest } from "../../../models/llm-request";

vi.mock("../../../logger", () => ({
	Logger: vi.fn(() => ({
		debug: vi.fn(),
		error: vi.fn(),
		warn: vi.fn(),
		info: vi.fn(),
	})),
}));

async function drain(
	gen: AsyncGenerator<unknown, void, unknown>,
): Promise<void> {
	for await (const _ of gen) {
		/* no events expected */
	}
}

describe("basic requestProcessor", () => {
	it("skips non-LlmAgent agents", async () => {
		const llmRequest = new LlmRequest();
		const invocationContext = {
			agent: { name: "plain" },
			runConfig: {},
		} as InvocationContext;

		await drain(requestProcessor.runAsync(invocationContext, llmRequest));

		expect(llmRequest.model).toBeUndefined();
	});

	it("sets model from string canonicalModel and copies config", async () => {
		const llmRequest = new LlmRequest();
		const invocationContext = {
			agent: {
				name: "llm-agent",
				canonicalModel: "gpt-4o",
				generateContentConfig: { temperature: 0.2 },
			},
			runConfig: {},
		} as InvocationContext;

		await drain(requestProcessor.runAsync(invocationContext, llmRequest));

		expect(llmRequest.model).toBe("gpt-4o");
		expect(llmRequest.config).toEqual({ temperature: 0.2 });
		expect(llmRequest.config).not.toBe(
			(invocationContext.agent as { generateContentConfig: object })
				.generateContentConfig,
		);
	});

	it("reads model from object canonicalModel", async () => {
		const llmRequest = new LlmRequest();
		const invocationContext = {
			agent: {
				name: "llm-agent",
				canonicalModel: { model: "gemini-2.5-flash" },
			},
			runConfig: {},
		} as InvocationContext;

		await drain(requestProcessor.runAsync(invocationContext, llmRequest));

		expect(llmRequest.model).toBe("gemini-2.5-flash");
		expect(llmRequest.config).toEqual({});
	});

	it("sets output schema when no tools or transfers exist", async () => {
		const schema = { type: "object" };
		const llmRequest = new LlmRequest();
		const invocationContext = {
			agent: {
				name: "schema-agent",
				canonicalModel: "gpt-4o",
				outputSchema: schema,
				canonicalTools: async () => [],
				subAgents: [],
			},
			runConfig: {},
		} as unknown as InvocationContext;

		await drain(requestProcessor.runAsync(invocationContext, llmRequest));

		expect(llmRequest.config?.responseSchema).toBe(schema);
		expect(llmRequest.config?.responseMimeType).toBe("application/json");
	});

	it("skips request-level output schema when tools are present", async () => {
		const schema = { type: "object" };
		const llmRequest = new LlmRequest();
		const invocationContext = {
			agent: {
				name: "tool-agent",
				canonicalModel: "gpt-4o",
				outputSchema: schema,
				canonicalTools: async () => [{ name: "search" }],
				subAgents: [],
			},
			runConfig: {},
		} as unknown as InvocationContext;

		await drain(requestProcessor.runAsync(invocationContext, llmRequest));

		expect(llmRequest.config?.responseSchema).toBeUndefined();
	});

	it("skips output schema when transferable sub-agents exist", async () => {
		const schema = { type: "object" };
		const llmRequest = new LlmRequest();
		const invocationContext = {
			agent: {
				name: "transfer-agent",
				canonicalModel: "gpt-4o",
				outputSchema: schema,
				canonicalTools: async () => [],
				subAgents: [{ name: "child" }],
				disallowTransferToParent: false,
				disallowTransferToPeers: false,
			},
			runConfig: {},
		} as unknown as InvocationContext;

		await drain(requestProcessor.runAsync(invocationContext, llmRequest));

		expect(llmRequest.config?.responseSchema).toBeUndefined();
	});

	it("copies live connect settings from runConfig", async () => {
		const llmRequest = new LlmRequest();
		const speechConfig = { voiceConfig: { prebuiltVoiceConfig: {} } };
		const invocationContext = {
			agent: {
				name: "live-agent",
				canonicalModel: "gpt-4o",
			},
			runConfig: {
				responseModalities: ["AUDIO"],
				speechConfig,
				outputAudioTranscription: { languageCode: "en-US" },
				inputAudioTranscription: { languageCode: "en-US" },
				realtimeInputConfig: { automaticActivityDetection: {} },
				enableAffectiveDialog: true,
				proactivity: { proactiveAudio: true },
			},
		} as unknown as InvocationContext;

		await drain(requestProcessor.runAsync(invocationContext, llmRequest));

		expect(llmRequest.liveConnectConfig.responseModalities).toEqual(["AUDIO"]);
		expect(llmRequest.liveConnectConfig.speechConfig).toBe(speechConfig);
		expect(llmRequest.liveConnectConfig.enableAffectiveDialog).toBe(true);
		expect(llmRequest.liveConnectConfig.proactivity).toEqual({
			proactiveAudio: true,
		});
	});

	it("sets output schema when subAgents exist but transfers are fully disallowed", async () => {
		const schema = { type: "object", properties: { ok: { type: "boolean" } } };
		const llmRequest = new LlmRequest();
		const invocationContext = {
			agent: {
				name: "locked-agent",
				canonicalModel: "gpt-4o",
				outputSchema: schema,
				canonicalTools: async () => [],
				subAgents: [{ name: "child" }],
				disallowTransferToParent: true,
				disallowTransferToPeers: true,
			},
			runConfig: {},
		} as unknown as InvocationContext;

		await drain(requestProcessor.runAsync(invocationContext, llmRequest));

		expect(llmRequest.config?.responseSchema).toBe(schema);
		expect(llmRequest.config?.responseMimeType).toBe("application/json");
	});

	it("reuses a pre-existing liveConnectConfig object instead of replacing it", async () => {
		const llmRequest = new LlmRequest();
		const existing = { marker: "keep-me" } as Record<string, unknown>;
		(llmRequest as any).liveConnectConfig = existing;
		const speechConfig = { voiceConfig: { prebuiltVoiceConfig: {} } };
		const invocationContext = {
			agent: {
				name: "live-agent",
				canonicalModel: "gpt-4o",
			},
			runConfig: {
				speechConfig,
				enableAffectiveDialog: false,
			},
		} as unknown as InvocationContext;

		await drain(requestProcessor.runAsync(invocationContext, llmRequest));

		expect(llmRequest.liveConnectConfig).toBe(existing);
		expect(llmRequest.liveConnectConfig.speechConfig).toBe(speechConfig);
		expect(llmRequest.liveConnectConfig.enableAffectiveDialog).toBe(false);
		expect((llmRequest.liveConnectConfig as any).marker).toBe("keep-me");
	});

	it("leaves responseModalities unset when runConfig omits them", async () => {
		const llmRequest = new LlmRequest();
		const invocationContext = {
			agent: {
				name: "live-agent",
				canonicalModel: "gpt-4o",
			},
			runConfig: {
				speechConfig: { voiceConfig: {} },
			},
		} as unknown as InvocationContext;

		await drain(requestProcessor.runAsync(invocationContext, llmRequest));

		expect(llmRequest.liveConnectConfig.responseModalities).toBeUndefined();
		expect(llmRequest.liveConnectConfig.speechConfig).toEqual({
			voiceConfig: {},
		});
	});

	it("swallows Logger construction errors while skipping output schema", async () => {
		const { Logger } = await import("../../../logger");
		vi.mocked(Logger).mockImplementationOnce(() => {
			throw new Error("logger boom");
		});

		const schema = { type: "object" };
		const llmRequest = new LlmRequest();
		const invocationContext = {
			agent: {
				name: "tool-agent",
				canonicalModel: "gpt-4o",
				outputSchema: schema,
				canonicalTools: async () => [{ name: "search" }],
				subAgents: [],
			},
			runConfig: {},
		} as unknown as InvocationContext;

		await expect(
			drain(requestProcessor.runAsync(invocationContext, llmRequest)),
		).resolves.toBeUndefined();
		expect(llmRequest.config?.responseSchema).toBeUndefined();
	});

	it("creates empty config when generateContentConfig is absent", async () => {
		const llmRequest = new LlmRequest();
		await drain(
			requestProcessor.runAsync(
				{
					agent: {
						name: "plain",
						canonicalModel: "gpt-4o",
					},
					runConfig: {},
				} as unknown as InvocationContext,
				llmRequest,
			),
		);

		expect(llmRequest.model).toBe("gpt-4o");
		expect(llmRequest.config).toEqual({});
		expect(llmRequest.liveConnectConfig).toBeDefined();
	});

	it("sets output schema when subAgents is empty even if property exists", async () => {
		const schema = { type: "object", properties: { a: { type: "string" } } };
		const llmRequest = new LlmRequest();
		await drain(
			requestProcessor.runAsync(
				{
					agent: {
						name: "solo",
						canonicalModel: "gpt-4o",
						outputSchema: schema,
						canonicalTools: async () => [],
						subAgents: [],
					},
					runConfig: {},
				} as unknown as InvocationContext,
				llmRequest,
			),
		);

		expect(llmRequest.config?.responseSchema).toBeDefined();
	});

	it("copies remaining live connect fields from runConfig", async () => {
		const llmRequest = new LlmRequest();
		const realtimeInputConfig = { activityHandling: "START_OF_ACTIVITY" };
		const proactivity = { proactiveAudio: true };
		await drain(
			requestProcessor.runAsync(
				{
					agent: {
						name: "live",
						canonicalModel: { model: "gemini-live" },
					},
					runConfig: {
						outputAudioTranscription: { languageCode: "en-US" },
						inputAudioTranscription: { languageCode: "en-GB" },
						realtimeInputConfig,
						enableAffectiveDialog: true,
						proactivity,
					},
				} as unknown as InvocationContext,
				llmRequest,
			),
		);

		expect(llmRequest.model).toBe("gemini-live");
		expect(llmRequest.liveConnectConfig.outputAudioTranscription).toEqual({
			languageCode: "en-US",
		});
		expect(llmRequest.liveConnectConfig.inputAudioTranscription).toEqual({
			languageCode: "en-GB",
		});
		expect(llmRequest.liveConnectConfig.realtimeInputConfig).toBe(
			realtimeInputConfig,
		);
		expect(llmRequest.liveConnectConfig.enableAffectiveDialog).toBe(true);
		expect(llmRequest.liveConnectConfig.proactivity).toBe(proactivity);
	});
});
