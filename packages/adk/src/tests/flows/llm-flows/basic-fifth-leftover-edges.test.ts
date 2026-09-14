import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InvocationContext } from "../../../agents/invocation-context";
import { requestProcessor } from "../../../flows/llm-flows/basic";
import { LlmRequest } from "../../../models/llm-request";

const debugMock = vi.fn();

vi.mock("../../../logger", () => ({
	Logger: vi.fn(() => ({
		debug: debugMock,
		error: vi.fn(),
		warn: vi.fn(),
		info: vi.fn(),
	})),
}));

async function drain(
	gen: AsyncGenerator<unknown, void, unknown>,
): Promise<void> {
	for await (const _ of gen) {
		/* no events */
	}
}

describe("BasicLlmRequestProcessor fifth leftover edges (post #146)", () => {
	beforeEach(() => {
		debugMock.mockClear();
	});

	it("missing canonicalTools applies outputSchema", async () => {
		const schema = { type: "object", properties: { a: { type: "string" } } };
		const llmRequest = new LlmRequest();
		await drain(
			requestProcessor.runAsync(
				{
					agent: {
						name: "no-tools-method",
						canonicalModel: "gpt-4o",
						outputSchema: schema,
					},
					runConfig: {},
				} as InvocationContext,
				llmRequest,
			),
		);

		expect(llmRequest.config?.responseSchema).toEqual(schema);
		expect(debugMock).not.toHaveBeenCalled();
	});

	it("logs debug skip when tools are present (happy Logger path)", async () => {
		const schema = { type: "object" };
		const llmRequest = new LlmRequest();
		await drain(
			requestProcessor.runAsync(
				{
					agent: {
						name: "with-tools",
						canonicalModel: "gpt-4o",
						outputSchema: schema,
						canonicalTools: async () => [{ name: "t1" }],
					},
					runConfig: {},
				} as InvocationContext,
				llmRequest,
			),
		);

		expect(llmRequest.config?.responseSchema).toBeUndefined();
		expect(debugMock).toHaveBeenCalledWith(
			expect.stringContaining(
				"Skipping request-level output schema for agent with-tools",
			),
		);
	});

	it("truthy non-array subAgents does not count as transfers so schema applies", async () => {
		const schema = { type: "object" };
		const llmRequest = new LlmRequest();
		await drain(
			requestProcessor.runAsync(
				{
					agent: {
						name: "object-subs",
						canonicalModel: "gpt-4o",
						outputSchema: schema,
						subAgents: { a: 1 },
					},
					runConfig: {},
				} as InvocationContext,
				llmRequest,
			),
		);

		expect(llmRequest.config?.responseSchema).toEqual(schema);
		expect(debugMock).not.toHaveBeenCalled();
	});

	it("pre-seeded liveConnectConfig without responseModalities still copies other live fields", async () => {
		const llmRequest = new LlmRequest();
		llmRequest.liveConnectConfig = {
			enableAffectiveDialog: false,
		} as any;

		await drain(
			requestProcessor.runAsync(
				{
					agent: {
						name: "live-agent",
						canonicalModel: "gpt-4o",
					},
					runConfig: {
						speechConfig: {
							voiceConfig: { prebuiltVoiceConfig: { voiceName: "Puck" } },
						},
						outputAudioTranscription: { languageCode: "en-US" },
						inputAudioTranscription: { languageCode: "en-US" },
						realtimeInputConfig: { automaticActivityDetection: {} },
						enableAffectiveDialog: true,
						proactivity: { proactiveAudio: true },
					},
				} as InvocationContext,
				llmRequest,
			),
		);

		expect(llmRequest.liveConnectConfig?.responseModalities).toBeUndefined();
		expect(llmRequest.liveConnectConfig?.speechConfig).toEqual({
			voiceConfig: { prebuiltVoiceConfig: { voiceName: "Puck" } },
		});
		expect(llmRequest.liveConnectConfig?.outputAudioTranscription).toEqual({
			languageCode: "en-US",
		});
		expect(llmRequest.liveConnectConfig?.inputAudioTranscription).toEqual({
			languageCode: "en-US",
		});
		expect(llmRequest.liveConnectConfig?.enableAffectiveDialog).toBe(true);
		expect(llmRequest.liveConnectConfig?.proactivity).toEqual({
			proactiveAudio: true,
		});
	});

	it("deep-copies nested generateContentConfig arrays and objects", async () => {
		const nested = {
			temperature: 0.3,
			stopSequences: ["END"],
			safetySettings: [{ category: "HARM", threshold: "BLOCK" }],
		};
		const llmRequest = new LlmRequest();
		const agentConfig = nested;
		await drain(
			requestProcessor.runAsync(
				{
					agent: {
						name: "nested-cfg",
						canonicalModel: "gpt-4o",
						generateContentConfig: agentConfig,
					},
					runConfig: {},
				} as InvocationContext,
				llmRequest,
			),
		);

		expect(llmRequest.config).toEqual(nested);
		expect(llmRequest.config).not.toBe(agentConfig);
		expect((llmRequest.config as any).stopSequences).not.toBe(
			nested.stopSequences,
		);
		expect((llmRequest.config as any).safetySettings).not.toBe(
			nested.safetySettings,
		);
		(llmRequest.config as any).stopSequences.push("X");
		expect(nested.stopSequences).toEqual(["END"]);
	});

	it("empty subAgents array with schema applies schema (no transfers)", async () => {
		const schema = { type: "object" };
		const llmRequest = new LlmRequest();
		await drain(
			requestProcessor.runAsync(
				{
					agent: {
						name: "empty-subs",
						canonicalModel: "gpt-4o",
						outputSchema: schema,
						subAgents: [],
						canonicalTools: async () => [],
					},
					runConfig: {},
				} as InvocationContext,
				llmRequest,
			),
		);

		expect(llmRequest.config?.responseSchema).toEqual(schema);
	});
});
