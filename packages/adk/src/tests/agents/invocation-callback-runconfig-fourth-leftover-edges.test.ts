import { afterEach, describe, expect, it, vi } from "vitest";
import { BaseAgent } from "../../agents/base-agent";
import { CallbackContext } from "../../agents/callback-context";
import {
	InvocationContext,
	LlmCallsLimitExceededError,
	newInvocationContextId,
} from "../../agents/invocation-context";
import { LiveRequestQueue } from "../../agents/live-request-queue";
import { RunConfig, StreamingMode } from "../../agents/run-config";
import { EventActions } from "../../events/event-actions";
import { PluginManager } from "../../plugins/plugin-manager";
import type { BaseSessionService } from "../../sessions/base-session-service";
import type { Session } from "../../sessions/session";

function makeAgent(name: string): BaseAgent {
	return { name } as BaseAgent;
}

function makeSession(overrides: Partial<Session> = {}): Session {
	return {
		id: "session-fourth",
		appName: "app-fourth",
		userId: "user-fourth",
		state: {},
		events: [],
		...overrides,
	} as Session;
}

function makeInvocation(
	overrides: Partial<ConstructorParameters<typeof InvocationContext>[0]> = {},
): InvocationContext {
	return new InvocationContext({
		sessionService: {} as BaseSessionService,
		pluginManager: new PluginManager(),
		agent: makeAgent("root"),
		session: makeSession(),
		...overrides,
	});
}

describe("InvocationContext fourth leftover edges — endInvocation / branch", () => {
	it("defaults endInvocation to false when omitted", () => {
		expect(makeInvocation().endInvocation).toBe(false);
	});

	it("coalesces endInvocation undefined to false via ||", () => {
		expect(makeInvocation({ endInvocation: undefined }).endInvocation).toBe(
			false,
		);
	});

	it("preserves explicit endInvocation true", () => {
		expect(makeInvocation({ endInvocation: true }).endInvocation).toBe(true);
	});

	it("preserves explicit endInvocation false", () => {
		expect(makeInvocation({ endInvocation: false }).endInvocation).toBe(false);
	});

	it("leaves branch undefined when omitted", () => {
		expect(makeInvocation().branch).toBeUndefined();
	});

	it("preserves explicit branch strings", () => {
		expect(makeInvocation({ branch: "a.b.c" }).branch).toBe("a.b.c");
	});

	it("createChildContext appends agent name when parent branch is set", () => {
		const parent = makeInvocation({ branch: "root" });
		const childAgent = makeAgent("child");
		const child = parent.createChildContext(childAgent);
		expect(child.branch).toBe("root.child");
		expect(child.agent).toBe(childAgent);
		expect(child.invocationId).toBe(parent.invocationId);
	});

	it("createChildContext uses agent name when parent branch is undefined", () => {
		const parent = makeInvocation();
		const child = parent.createChildContext(makeAgent("solo"));
		expect(child.branch).toBe("solo");
	});

	it("createChildContext copies endInvocation and services", () => {
		const queue = new LiveRequestQueue();
		const runConfig = new RunConfig({ maxLlmCalls: 9 });
		const parent = makeInvocation({
			endInvocation: true,
			liveRequestQueue: queue,
			runConfig,
			activeStreamingTools: {},
			transcriptionCache: [],
		});
		const child = parent.createChildContext(makeAgent("copy_child"));
		expect(child.endInvocation).toBe(true);
		expect(child.liveRequestQueue).toBe(queue);
		expect(child.runConfig).toBe(runConfig);
		expect(child.sessionService).toBe(parent.sessionService);
		expect(child.pluginManager).toBe(parent.pluginManager);
	});

	it("appName and userId reflect session fields", () => {
		const ctx = makeInvocation({
			session: makeSession({ appName: "my-app", userId: "my-user" }),
		});
		expect(ctx.appName).toBe("my-app");
		expect(ctx.userId).toBe("my-user");
	});

	it("newInvocationContextId returns e- prefixed uuid strings", () => {
		const id = newInvocationContextId();
		expect(id.startsWith("e-")).toBe(true);
		expect(id.length).toBeGreaterThan(10);
	});

	it("generates invocationId when omitted", () => {
		const ctx = makeInvocation();
		expect(ctx.invocationId.startsWith("e-")).toBe(true);
	});

	it("preserves explicit invocationId", () => {
		expect(makeInvocation({ invocationId: "fixed-id" }).invocationId).toBe(
			"fixed-id",
		);
	});

	it("incrementLlmCallCount enforces positive maxLlmCalls", () => {
		const ctx = makeInvocation({
			runConfig: new RunConfig({ maxLlmCalls: 2 }),
		});
		ctx.incrementLlmCallCount();
		ctx.incrementLlmCallCount();
		expect(() => ctx.incrementLlmCallCount()).toThrow(
			LlmCallsLimitExceededError,
		);
	});

	it("incrementLlmCallCount does not enforce when maxLlmCalls <= 0", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const ctx = makeInvocation({
			runConfig: new RunConfig({ maxLlmCalls: 0 }),
		});
		for (let i = 0; i < 5; i++) {
			ctx.incrementLlmCallCount();
		}
		warn.mockRestore();
	});

	it("incrementLlmCallCount is a no-op limit when runConfig omitted", () => {
		const ctx = makeInvocation();
		expect(() => ctx.incrementLlmCallCount()).not.toThrow();
	});
});

describe("CallbackContext fourth leftover edges", () => {
	it("exposes invocation-backed readonly fields via inheritance", () => {
		const invocation = makeInvocation({
			invocationId: "cb-inv",
			userContent: { role: "user", parts: [{ text: "hi" }] },
		});
		const ctx = new CallbackContext(invocation);
		expect(ctx.invocationId).toBe("cb-inv");
		expect(ctx.agentName).toBe("root");
		expect(ctx.userContent?.parts?.[0]?.text).toBe("hi");
	});

	it("state mutations populate eventActions.stateDelta", () => {
		const ctx = new CallbackContext(makeInvocation());
		ctx.state.flag = true;
		expect(ctx.eventActions.stateDelta?.flag).toBe(true);
		expect(ctx.state.hasDelta()).toBe(true);
	});

	it("reuses provided EventActions reference", () => {
		const actions = new EventActions({ escalate: true });
		const ctx = new CallbackContext(makeInvocation(), {
			eventActions: actions,
		});
		ctx.state.x = 1;
		expect(ctx.eventActions).toBe(actions);
		expect(actions.stateDelta?.x).toBe(1);
	});
});

describe("RunConfig fourth leftover edges — speech / realtime nullish", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("leaves speechConfig undefined for omit and explicit undefined", () => {
		expect(new RunConfig().speechConfig).toBeUndefined();
		expect(
			new RunConfig({ speechConfig: undefined }).speechConfig,
		).toBeUndefined();
	});

	it("passes through speechConfig objects by reference", () => {
		const speechConfig = { languageCode: "en-GB" } as any;
		expect(new RunConfig({ speechConfig }).speechConfig).toBe(speechConfig);
	});

	it("leaves realtimeInputConfig undefined for omit and undefined", () => {
		expect(new RunConfig().realtimeInputConfig).toBeUndefined();
		expect(
			new RunConfig({ realtimeInputConfig: undefined }).realtimeInputConfig,
		).toBeUndefined();
	});

	it("passes through realtimeInputConfig by reference", () => {
		const realtimeInputConfig = { automaticActivityDetection: {} } as any;
		expect(new RunConfig({ realtimeInputConfig }).realtimeInputConfig).toBe(
			realtimeInputConfig,
		);
	});

	it("leaves input/output transcription undefined when nullish", () => {
		const config = new RunConfig({
			inputAudioTranscription: undefined,
			outputAudioTranscription: undefined,
		});
		expect(config.inputAudioTranscription).toBeUndefined();
		expect(config.outputAudioTranscription).toBeUndefined();
	});

	it("passes through input and output transcription configs", () => {
		const inputAudioTranscription = { languageCode: "es-ES" } as any;
		const outputAudioTranscription = { languageCode: "it-IT" } as any;
		const config = new RunConfig({
			inputAudioTranscription,
			outputAudioTranscription,
		});
		expect(config.inputAudioTranscription).toBe(inputAudioTranscription);
		expect(config.outputAudioTranscription).toBe(outputAudioTranscription);
	});

	it("leaves proactivity and enableAffectiveDialog undefined when nullish", () => {
		const config = new RunConfig({
			proactivity: undefined,
			enableAffectiveDialog: undefined,
		});
		expect(config.proactivity).toBeUndefined();
		expect(config.enableAffectiveDialog).toBeUndefined();
	});

	it("passes through proactivity and enableAffectiveDialog when set", () => {
		const proactivity = { proactiveAudio: true } as any;
		const config = new RunConfig({
			proactivity,
			enableAffectiveDialog: false,
		});
		expect(config.proactivity).toBe(proactivity);
		expect(config.enableAffectiveDialog).toBe(false);
	});

	it("leaves responseModalities undefined when nullish", () => {
		expect(
			new RunConfig({ responseModalities: undefined }).responseModalities,
		).toBeUndefined();
	});

	it("passes through responseModalities arrays by reference", () => {
		const responseModalities = ["AUDIO"];
		expect(new RunConfig({ responseModalities }).responseModalities).toBe(
			responseModalities,
		);
	});

	it("coalesces streamingMode undefined to NONE", () => {
		expect(new RunConfig({ streamingMode: undefined }).streamingMode).toBe(
			StreamingMode.NONE,
		);
	});

	it("preserves SSE and BIDI streaming modes", () => {
		expect(
			new RunConfig({ streamingMode: StreamingMode.SSE }).streamingMode,
		).toBe(StreamingMode.SSE);
		expect(
			new RunConfig({ streamingMode: StreamingMode.BIDI }).streamingMode,
		).toBe(StreamingMode.BIDI);
	});

	it("coalesces boolean flags with || false for undefined", () => {
		const config = new RunConfig({
			saveInputBlobsAsArtifacts: undefined,
			supportCFC: undefined,
		});
		expect(config.saveInputBlobsAsArtifacts).toBe(false);
		expect(config.supportCFC).toBe(false);
	});

	it("uses ?? 500 for maxLlmCalls when omitted or undefined", () => {
		expect(new RunConfig().maxLlmCalls).toBe(500);
		expect(new RunConfig({ maxLlmCalls: undefined }).maxLlmCalls).toBe(500);
	});
});
