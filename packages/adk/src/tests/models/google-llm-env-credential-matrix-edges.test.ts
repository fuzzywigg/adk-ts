import { GoogleGenAI } from "@google/genai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GoogleLlm } from "../../models/google-llm";

vi.mock("@adk/helpers/logger", () => ({
	Logger: vi.fn(() => ({
		debug: vi.fn(),
		error: vi.fn(),
	})),
}));

vi.mock("@google/genai", () => ({
	GoogleGenAI: vi.fn(),
	FinishReason: {
		STOP: "STOP",
		MAX_TOKENS: "MAX_TOKENS",
		FINISH_REASON_UNSPECIFIED: "FINISH_REASON_UNSPECIFIED",
	},
}));

describe("GoogleLlm env credential matrix leftover edges (post #144)", () => {
	let originalEnv: NodeJS.ProcessEnv;

	beforeEach(() => {
		originalEnv = { ...process.env };
		vi.clearAllMocks();
		(GoogleGenAI as unknown as ReturnType<typeof vi.fn>).mockImplementation(
			() => ({
				models: {
					generateContent: vi.fn(),
					generateContentStream: vi.fn(),
				},
			}),
		);
	});

	afterEach(() => {
		process.env = originalEnv;
	});

	function clearGoogleEnv() {
		delete process.env.GOOGLE_GENAI_USE_VERTEXAI;
		delete process.env.GOOGLE_API_KEY;
		delete process.env.GOOGLE_CLOUD_PROJECT;
		delete process.env.GOOGLE_CLOUD_LOCATION;
		delete process.env.GOOGLE_CLOUD_AGENT_ENGINE_ID;
	}

	describe("apiClient credential matrix", () => {
		it.each([
			{
				label: "vertex true + project + location",
				env: {
					GOOGLE_GENAI_USE_VERTEXAI: "true",
					GOOGLE_CLOUD_PROJECT: "fake-proj",
					GOOGLE_CLOUD_LOCATION: "fake-loc",
				},
				expected: {
					vertexai: true,
					project: "fake-proj",
					location: "fake-loc",
				},
			},
			{
				label: "api key only",
				env: { GOOGLE_API_KEY: "fake-api-key" },
				expected: { apiKey: "fake-api-key" },
			},
			{
				label: "vertex true missing location falls back to api key",
				env: {
					GOOGLE_GENAI_USE_VERTEXAI: "true",
					GOOGLE_CLOUD_PROJECT: "fake-proj",
					GOOGLE_API_KEY: "fake-fallback-key",
				},
				expected: { apiKey: "fake-fallback-key" },
			},
			{
				label: "vertex true missing project falls back to api key",
				env: {
					GOOGLE_GENAI_USE_VERTEXAI: "true",
					GOOGLE_CLOUD_LOCATION: "fake-loc",
					GOOGLE_API_KEY: "fake-fallback-key-2",
				},
				expected: { apiKey: "fake-fallback-key-2" },
			},
			{
				label: "vertex false with api key ignores project/location",
				env: {
					GOOGLE_GENAI_USE_VERTEXAI: "false",
					GOOGLE_CLOUD_PROJECT: "ignored-proj",
					GOOGLE_CLOUD_LOCATION: "ignored-loc",
					GOOGLE_API_KEY: "fake-gemini-key",
				},
				expected: { apiKey: "fake-gemini-key" },
			},
		])("creates client for $label", ({ env, expected }) => {
			clearGoogleEnv();
			Object.assign(process.env, env);
			const llm = new GoogleLlm();
			const client = llm.apiClient;
			expect(GoogleGenAI).toHaveBeenCalledWith(expected);
			expect(llm.apiClient).toBe(client);
		});

		it.each([
			{
				label: "no env at all",
				env: {},
			},
			{
				label: "vertex true without project/location/key",
				env: { GOOGLE_GENAI_USE_VERTEXAI: "true" },
			},
			{
				label: "vertex true with project only",
				env: {
					GOOGLE_GENAI_USE_VERTEXAI: "true",
					GOOGLE_CLOUD_PROJECT: "orphan-proj",
				},
			},
			{
				label: "empty api key string is falsy",
				env: { GOOGLE_API_KEY: "" },
			},
		])("throws for $label", ({ env }) => {
			clearGoogleEnv();
			Object.assign(process.env, env);
			const llm = new GoogleLlm();
			expect(() => llm.apiClient).toThrow(
				/Google API Key or Vertex AI configuration is required/,
			);
		});
	});

	describe("liveApiClient credential matrix", () => {
		it.each([
			{
				label: "vertex live client",
				env: {
					GOOGLE_GENAI_USE_VERTEXAI: "true",
					GOOGLE_CLOUD_PROJECT: "live-proj",
					GOOGLE_CLOUD_LOCATION: "live-loc",
				},
				expected: {
					vertexai: true,
					project: "live-proj",
					location: "live-loc",
					apiVersion: "v1beta1",
				},
			},
			{
				label: "gemini live client",
				env: {
					GOOGLE_GENAI_USE_VERTEXAI: "false",
					GOOGLE_API_KEY: "fake-live-key",
				},
				expected: {
					apiKey: "fake-live-key",
					apiVersion: "v1alpha",
				},
			},
			{
				label:
					"vertex flag with missing location uses api key + vertex version",
				env: {
					GOOGLE_GENAI_USE_VERTEXAI: "true",
					GOOGLE_CLOUD_PROJECT: "live-proj",
					GOOGLE_API_KEY: "fake-live-fallback",
				},
				expected: {
					apiKey: "fake-live-fallback",
					apiVersion: "v1beta1",
				},
			},
		])("creates live client for $label", ({ env, expected }) => {
			clearGoogleEnv();
			Object.assign(process.env, env);
			const llm = new GoogleLlm();
			const client = llm.liveApiClient;
			expect(GoogleGenAI).toHaveBeenCalledWith(expected);
			expect(llm.liveApiClient).toBe(client);
		});

		it.each([
			{ label: "empty env", env: {} },
			{
				label: "vertex incomplete",
				env: {
					GOOGLE_GENAI_USE_VERTEXAI: "true",
					GOOGLE_CLOUD_LOCATION: "only-loc",
				},
			},
		])("throws live client for $label", ({ env }) => {
			clearGoogleEnv();
			Object.assign(process.env, env);
			const llm = new GoogleLlm();
			expect(() => llm.liveApiClient).toThrow(
				/API configuration required for live client/,
			);
		});
	});

	describe("apiBackend coercion matrix", () => {
		it.each([
			{ flag: "true", expected: "VERTEX_AI" },
			{ flag: "false", expected: "GEMINI_API" },
			{ flag: "TRUE", expected: "GEMINI_API" },
			{ flag: "1", expected: "GEMINI_API" },
			{ flag: "", expected: "GEMINI_API" },
			{ flag: undefined, expected: "GEMINI_API" },
		])("maps GOOGLE_GENAI_USE_VERTEXAI=$flag to $expected", ({
			flag,
			expected,
		}) => {
			clearGoogleEnv();
			if (flag === undefined) {
				delete process.env.GOOGLE_GENAI_USE_VERTEXAI;
			} else {
				process.env.GOOGLE_GENAI_USE_VERTEXAI = flag;
			}
			const llm = new GoogleLlm();
			expect(llm.apiBackend).toBe(expected);
			expect(llm.apiBackend).toBe(expected);
		});
	});

	describe("trackingHeaders agent-engine matrix", () => {
		it.each([
			{
				label: "absent agent engine id",
				agentEngineId: undefined,
				expectTag: false,
			},
			{
				label: "empty agent engine id is falsy",
				agentEngineId: "",
				expectTag: false,
			},
			{
				label: "present agent engine id",
				agentEngineId: "fake-engine-id",
				expectTag: true,
			},
		])("$label", ({ agentEngineId, expectTag }) => {
			clearGoogleEnv();
			if (agentEngineId === undefined) {
				delete process.env.GOOGLE_CLOUD_AGENT_ENGINE_ID;
			} else {
				process.env.GOOGLE_CLOUD_AGENT_ENGINE_ID = agentEngineId;
			}
			const llm = new GoogleLlm();
			(llm as any)._trackingHeaders = undefined;
			const headers = llm.trackingHeaders;
			expect(headers["x-goog-api-client"]).toMatch(/google-adk\/1\.0\.0/);
			expect(headers["user-agent"]).toBe(headers["x-goog-api-client"]);
			if (expectTag) {
				expect(headers["x-goog-api-client"]).toContain(
					"remote_reasoning_engine",
				);
			} else {
				expect(headers["x-goog-api-client"]).not.toContain(
					"remote_reasoning_engine",
				);
			}
			expect(llm.trackingHeaders).toBe(headers);
		});
	});

	describe("liveApiVersion matrix", () => {
		it.each([
			{ flag: "true", version: "v1beta1" },
			{ flag: "false", version: "v1alpha" },
			{ flag: undefined, version: "v1alpha" },
		])("flag=$flag yields $version", ({ flag, version }) => {
			clearGoogleEnv();
			if (flag === undefined) {
				delete process.env.GOOGLE_GENAI_USE_VERTEXAI;
			} else {
				process.env.GOOGLE_GENAI_USE_VERTEXAI = flag;
			}
			expect(new GoogleLlm().liveApiVersion).toBe(version);
		});
	});
});
