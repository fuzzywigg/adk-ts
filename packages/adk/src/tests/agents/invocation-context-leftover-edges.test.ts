import { afterEach, describe, expect, it, vi } from "vitest";
import type { BaseAgent } from "../../agents/base-agent";
import { CallbackContext } from "../../agents/callback-context";
import {
	InvocationContext,
	LlmCallsLimitExceededError,
	newInvocationContextId,
} from "../../agents/invocation-context";
import { LiveRequest, LiveRequestQueue } from "../../agents/live-request-queue";
import { ReadonlyContext } from "../../agents/readonly-context";
import { RunConfig, StreamingMode } from "../../agents/run-config";
import { TranscriptionEntry } from "../../agents/transcription-entry";
import { EventActions } from "../../events/event-actions";
import { PluginManager } from "../../plugins/plugin-manager";
import type { BaseSessionService } from "../../sessions/base-session-service";
import type { Session } from "../../sessions/session";

function makeAgent(name: string): BaseAgent {
	return { name } as BaseAgent;
}

function makeSession(overrides: Partial<Session> = {}): Session {
	return {
		id: "session-1",
		appName: "app",
		userId: "user-1",
		state: {},
		events: [],
		...overrides,
	} as Session;
}

function makeContext(
	overrides: ConstructorParameters<typeof InvocationContext>[0] = {
		sessionService: {} as BaseSessionService,
		pluginManager: new PluginManager(),
		agent: makeAgent("root"),
		session: makeSession(),
	},
): InvocationContext {
	return new InvocationContext({
		sessionService: {} as BaseSessionService,
		pluginManager: new PluginManager(),
		agent: makeAgent("root"),
		session: makeSession(),
		...overrides,
	});
}

describe("InvocationContext leftover edge matrices", () => {
	const idMatrix = Array.from({ length: 8 }, (_, i) => i);

	for (const i of idMatrix) {
		it(`newInvocationContextId #${i} has e- prefix and uuid shape`, () => {
			const id = newInvocationContextId();
			expect(id).toMatch(/^e-[0-9a-f-]{36}$/i);
		});
	}

	const serviceCombos: Array<{
		label: string;
		artifactService: any;
		memoryService: any;
	}> = [
		{
			label: "both undefined",
			artifactService: undefined,
			memoryService: undefined,
		},
		{
			label: "both null-ish omitted",
			artifactService: undefined,
			memoryService: undefined,
		},
		{
			label: "artifact only",
			artifactService: { loadArtifact: vi.fn(), saveArtifact: vi.fn() },
			memoryService: undefined,
		},
		{
			label: "memory only",
			artifactService: undefined,
			memoryService: { searchMemory: vi.fn() },
		},
		{
			label: "both present",
			artifactService: { loadArtifact: vi.fn(), saveArtifact: vi.fn() },
			memoryService: { searchMemory: vi.fn() },
		},
	];

	for (const { label, artifactService, memoryService } of serviceCombos) {
		it(`nullish services combo: ${label}`, () => {
			const ctx = makeContext({
				sessionService: {} as BaseSessionService,
				pluginManager: new PluginManager(),
				agent: makeAgent("root"),
				session: makeSession(),
				artifactService,
				memoryService,
			});
			expect(ctx.artifactService).toBe(artifactService);
			expect(ctx.memoryService).toBe(memoryService);
			const child = ctx.createChildContext(makeAgent("child"));
			expect(child.artifactService).toBe(artifactService);
			expect(child.memoryService).toBe(memoryService);
		});
	}

	const endInvocationCases = [false, true, undefined];
	for (const end of endInvocationCases) {
		it(`endInvocation constructor default/override: ${String(end)}`, () => {
			const ctx = makeContext({
				sessionService: {} as BaseSessionService,
				pluginManager: new PluginManager(),
				agent: makeAgent("root"),
				session: makeSession(),
				endInvocation: end as any,
			});
			expect(ctx.endInvocation).toBe(Boolean(end));
			ctx.endInvocation = !ctx.endInvocation;
			expect(ctx.endInvocation).toBe(!end);
		});
	}

	const maxLlmCases: Array<{
		label: string;
		max: number;
		calls: number;
		throwsAt?: number;
	}> = [
		{ label: "limit 1", max: 1, calls: 2, throwsAt: 2 },
		{ label: "limit 2", max: 2, calls: 3, throwsAt: 3 },
		{ label: "limit 3 exact", max: 3, calls: 3 },
		{ label: "zero unlimited", max: 0, calls: 5 },
		{ label: "negative unlimited", max: -1, calls: 4 },
		{ label: "limit 5", max: 5, calls: 5 },
	];

	for (const { label, max, calls, throwsAt } of maxLlmCases) {
		it(`llm call limit matrix: ${label}`, () => {
			const ctx = makeContext({
				sessionService: {} as BaseSessionService,
				pluginManager: new PluginManager(),
				agent: makeAgent("root"),
				session: makeSession(),
				runConfig: new RunConfig({ maxLlmCalls: max }),
			});
			for (let i = 1; i <= calls; i++) {
				if (throwsAt && i === throwsAt) {
					expect(() => ctx.incrementLlmCallCount()).toThrow(
						LlmCallsLimitExceededError,
					);
				} else {
					expect(() => ctx.incrementLlmCallCount()).not.toThrow();
				}
			}
		});
	}

	it("createChildContext nests branch names", () => {
		const root = makeContext({
			sessionService: {} as BaseSessionService,
			pluginManager: new PluginManager(),
			agent: makeAgent("root"),
			session: makeSession(),
			branch: "root",
		});
		const a = root.createChildContext(makeAgent("a"));
		const b = a.createChildContext(makeAgent("b"));
		const c = b.createChildContext(makeAgent("c"));
		expect(a.branch).toBe("root.a");
		expect(b.branch).toBe("root.a.b");
		expect(c.branch).toBe("root.a.b.c");
		expect(c.invocationId).toBe(root.invocationId);
		expect(c.session).toBe(root.session);
	});

	it("createChildContext from undefined branch starts with agent name", () => {
		const root = makeContext();
		expect(root.branch).toBeUndefined();
		const child = root.createChildContext(makeAgent("leaf"));
		expect(child.branch).toBe("leaf");
	});

	const queueCases = [
		{ label: "undefined queue", queue: undefined },
		{ label: "empty LiveRequestQueue", queue: new LiveRequestQueue() },
	];

	for (const { label, queue } of queueCases) {
		it(`liveRequestQueue option: ${label}`, () => {
			const ctx = makeContext({
				sessionService: {} as BaseSessionService,
				pluginManager: new PluginManager(),
				agent: makeAgent("root"),
				session: makeSession(),
				liveRequestQueue: queue,
			});
			expect(ctx.liveRequestQueue).toBe(queue);
		});
	}

	it("transcriptionCache and activeStreamingTools pass through", () => {
		const cache = [
			new TranscriptionEntry({
				role: "user",
				data: { role: "user", parts: [{ text: "hi" }] },
			}),
		];
		const tools = { t1: { name: "t1" } as any };
		const ctx = makeContext({
			sessionService: {} as BaseSessionService,
			pluginManager: new PluginManager(),
			agent: makeAgent("root"),
			session: makeSession(),
			transcriptionCache: cache,
			activeStreamingTools: tools,
		});
		expect(ctx.transcriptionCache).toBe(cache);
		expect(ctx.activeStreamingTools).toBe(tools);
		const child = ctx.createChildContext(makeAgent("c"));
		expect(child.transcriptionCache).toBe(cache);
		expect(child.activeStreamingTools).toBe(tools);
	});

	it("appName and userId follow session overrides", () => {
		const ctx = makeContext({
			sessionService: {} as BaseSessionService,
			pluginManager: new PluginManager(),
			agent: makeAgent("root"),
			session: makeSession({ appName: "other-app", userId: "u2", id: "s9" }),
		});
		expect(ctx.appName).toBe("other-app");
		expect(ctx.userId).toBe("u2");
		expect(ctx.session.id).toBe("s9");
	});
});

describe("CallbackContext leftover edge matrices", () => {
	function makeInvocation(
		options: { artifactService?: any; state?: Record<string, unknown> } = {},
	) {
		return new InvocationContext({
			sessionService: {} as BaseSessionService,
			pluginManager: new PluginManager(),
			agent: makeAgent("agent"),
			session: makeSession({ state: options.state ?? { existing: true } }),
			invocationId: "inv-1",
			artifactService: options.artifactService,
		});
	}

	it("creates default EventActions when omitted", () => {
		const ctx = new CallbackContext(makeInvocation());
		expect(ctx._eventActions).toBeInstanceOf(EventActions);
		expect(ctx.state.hasDelta()).toBe(false);
	});

	it("reuses provided EventActions", () => {
		const actions = new EventActions();
		const ctx = new CallbackContext(makeInvocation(), {
			eventActions: actions,
		});
		expect(ctx._eventActions).toBe(actions);
	});

	const stateKeys = ["a", "b", "c", "d", "e"];
	for (const key of stateKeys) {
		it(`state delta records set for key ${key}`, () => {
			const actions = new EventActions();
			const ctx = new CallbackContext(makeInvocation(), {
				eventActions: actions,
			});
			ctx.state.set(key, key.length);
			expect(actions.stateDelta).toEqual({ [key]: key.length });
			expect(ctx.state.get(key)).toBe(key.length);
			expect(ctx.state.hasDelta()).toBe(true);
		});
	}

	it("throws when loading artifact without service", async () => {
		const ctx = new CallbackContext(makeInvocation());
		await expect(ctx.loadArtifact("f.txt")).rejects.toThrow(
			/Artifact service is not initialized/,
		);
	});

	it("throws when saving artifact without service", async () => {
		const ctx = new CallbackContext(makeInvocation());
		await expect(ctx.saveArtifact("f.txt", { text: "x" })).rejects.toThrow(
			/Artifact service is not initialized/,
		);
	});

	const versions = [undefined, 0, 1, 2, 99];
	for (const version of versions) {
		it(`loadArtifact forwards version ${String(version)}`, async () => {
			const loadArtifact = vi.fn().mockResolvedValue({ text: "data" });
			const ctx = new CallbackContext(
				makeInvocation({
					artifactService: { loadArtifact, saveArtifact: vi.fn() },
				}),
			);
			await ctx.loadArtifact("file.txt", version);
			expect(loadArtifact).toHaveBeenCalledWith(
				expect.objectContaining({
					filename: "file.txt",
					version,
				}),
			);
		});
	}

	const filenames = ["a.txt", "b.bin", "path/nested.json", "x"];
	for (const filename of filenames) {
		it(`saveArtifact records artifactDelta for ${filename}`, async () => {
			const saveArtifact = vi.fn().mockResolvedValue(7);
			const ctx = new CallbackContext(
				makeInvocation({
					artifactService: { loadArtifact: vi.fn(), saveArtifact },
				}),
			);
			const version = await ctx.saveArtifact(filename, { text: "p" });
			expect(version).toBe(7);
			expect(ctx._eventActions.artifactDelta?.[filename]).toBe(7);
		});
	}
});

describe("ReadonlyContext leftover edge matrices", () => {
	const agentNames = ["a", "b", "researcher", "root"];
	for (const agentName of agentNames) {
		it(`exposes agentName ${agentName}`, () => {
			const inv = new InvocationContext({
				sessionService: {} as BaseSessionService,
				pluginManager: new PluginManager(),
				agent: makeAgent(agentName),
				session: makeSession(),
				invocationId: "inv-x",
			});
			const ctx = new ReadonlyContext(inv);
			expect(ctx.agentName).toBe(agentName);
			expect(ctx.invocationId).toBe("inv-x");
		});
	}

	it("userContent undefined when omitted", () => {
		const inv = new InvocationContext({
			sessionService: {} as BaseSessionService,
			pluginManager: new PluginManager(),
			agent: makeAgent("agent"),
			session: makeSession(),
		});
		expect(new ReadonlyContext(inv).userContent).toBeUndefined();
	});

	it("userContent present when provided", () => {
		const content = { role: "user" as const, parts: [{ text: "hi" }] };
		const inv = new InvocationContext({
			sessionService: {} as BaseSessionService,
			pluginManager: new PluginManager(),
			agent: makeAgent("agent"),
			session: makeSession(),
			userContent: content,
		});
		expect(new ReadonlyContext(inv).userContent).toBe(content);
	});

	it("state proxy is readonly view of session state", () => {
		const inv = new InvocationContext({
			sessionService: {} as BaseSessionService,
			pluginManager: new PluginManager(),
			agent: makeAgent("agent"),
			session: makeSession({ state: { k: 1, nested: { x: 2 } } }),
		});
		const ctx = new ReadonlyContext(inv);
		expect(ctx.state.k).toBe(1);
		expect(ctx.state.nested).toEqual({ x: 2 });
		expect(ctx.appName).toBe("app");
		expect(ctx.userId).toBe("user-1");
		expect(ctx.sessionId).toBe("session-1");
	});
});

describe("LiveRequestQueue leftover edge matrices", () => {
	it("LiveRequest close defaults and overrides", () => {
		expect(new LiveRequest().close).toBe(false);
		expect(new LiveRequest({ close: false }).close).toBe(false);
		expect(new LiveRequest({ close: true }).close).toBe(true);
		expect(new LiveRequest({ close: undefined }).close).toBe(false);
	});

	const payloads = [
		{ content: { role: "user" as const, parts: [] } },
		{ content: { role: "user" as const, parts: [{ text: "" }] } },
		{ content: { role: "user" as const, parts: [{ text: "x" }] } },
		{ blob: { data: "YQ==", mimeType: "text/plain" } },
		{
			content: { role: "model" as const, parts: [{ text: "m" }] },
			blob: { data: "Yg==", mimeType: "audio/pcm" },
		},
	];

	for (const [i, opts] of payloads.entries()) {
		it(`LiveRequest payload combo #${i}`, () => {
			const req = new LiveRequest(opts as any);
			expect(req.content).toEqual((opts as any).content);
			expect(req.blob).toEqual((opts as any).blob);
			expect(req.close).toBe(false);
		});
	}

	it("FIFO empty queue then put/get cycles", async () => {
		const queue = new LiveRequestQueue();
		queue.sendContent({ role: "user", parts: [{ text: "1" }] });
		queue.sendContent({ role: "user", parts: [{ text: "2" }] });
		queue.sendRealtime({ data: "Yw==", mimeType: "text/plain" });
		expect((await queue.get()).content?.parts?.[0]?.text).toBe("1");
		expect((await queue.get()).content?.parts?.[0]?.text).toBe("2");
		expect((await queue.get()).blob?.data).toBe("Yw==");
	});

	it("close drains waiter and rejects subsequent sends", async () => {
		const queue = new LiveRequestQueue();
		const pending = queue.get();
		queue.close();
		expect((await pending).close).toBe(true);
		expect(() => queue.sendContent({ role: "user", parts: [] })).toThrow(
			/Queue is closed/,
		);
		expect(() =>
			queue.sendRealtime({ data: "YQ==", mimeType: "text/plain" }),
		).toThrow(/Queue is closed/);
		expect(() => queue.send(new LiveRequest({ close: true }))).toThrow(
			/Queue is closed/,
		);
	});

	it("close after buffered items still returns close sentinel on later get", async () => {
		const queue = new LiveRequestQueue();
		queue.sendContent({ role: "user", parts: [{ text: "buf" }] });
		queue.close();
		expect((await queue.get()).content?.parts?.[0]?.text).toBe("buf");
		expect((await queue.get()).close).toBe(true);
	});

	it("multiple waiters resolve in order as sends arrive", async () => {
		const queue = new LiveRequestQueue();
		const p1 = queue.get();
		const p2 = queue.get();
		queue.sendContent({ role: "user", parts: [{ text: "first" }] });
		queue.sendContent({ role: "user", parts: [{ text: "second" }] });
		expect((await p1).content?.parts?.[0]?.text).toBe("first");
		expect((await p2).content?.parts?.[0]?.text).toBe("second");
	});
});

describe("RunConfig leftover edge matrices", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	const streamingModes = [
		StreamingMode.NONE,
		StreamingMode.SSE,
		StreamingMode.BIDI,
	];

	for (const mode of streamingModes) {
		it(`streamingMode ${mode}`, () => {
			expect(new RunConfig({ streamingMode: mode }).streamingMode).toBe(mode);
		});
	}

	const boolCombos = [
		{ saveInputBlobsAsArtifacts: true, supportCFC: true },
		{ saveInputBlobsAsArtifacts: true, supportCFC: false },
		{ saveInputBlobsAsArtifacts: false, supportCFC: true },
		{ saveInputBlobsAsArtifacts: false, supportCFC: false },
	];

	for (const combo of boolCombos) {
		it(`bool flags ${JSON.stringify(combo)}`, () => {
			const cfg = new RunConfig(combo);
			expect(cfg.saveInputBlobsAsArtifacts).toBe(
				combo.saveInputBlobsAsArtifacts,
			);
			expect(cfg.supportCFC).toBe(combo.supportCFC);
		});
	}

	const maxValues = [1, 2, 10, 500, 1000, -5, 0];
	for (const maxLlmCalls of maxValues) {
		it(`maxLlmCalls ${maxLlmCalls}`, () => {
			const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
			const cfg = new RunConfig({ maxLlmCalls });
			expect(cfg.maxLlmCalls).toBe(maxLlmCalls);
			if (maxLlmCalls <= 0) {
				expect(warn).toHaveBeenCalled();
			}
		});
	}

	it("throws for Number.MAX_SAFE_INTEGER", () => {
		expect(
			() => new RunConfig({ maxLlmCalls: Number.MAX_SAFE_INTEGER }),
		).toThrow(/maxLlmCalls should be less than/);
	});

	it("accepts optional live audio fields as undefined or set", () => {
		const empty = new RunConfig();
		expect(empty.speechConfig).toBeUndefined();
		expect(empty.responseModalities).toBeUndefined();
		expect(empty.enableAffectiveDialog).toBeUndefined();

		const speechConfig = { languageCode: "en" } as any;
		const filled = new RunConfig({
			speechConfig,
			responseModalities: ["TEXT"],
			enableAffectiveDialog: false,
			proactivity: { proactiveAudio: false } as any,
		});
		expect(filled.speechConfig).toBe(speechConfig);
		expect(filled.responseModalities).toEqual(["TEXT"]);
		expect(filled.enableAffectiveDialog).toBe(false);
	});
});

describe("TranscriptionEntry leftover edge matrices", () => {
	const roles = ["user", "model", "system", undefined, ""];
	for (const role of roles) {
		it(`role ${String(role)} with Content data`, () => {
			const data = { role: "user" as const, parts: [{ text: "t" }] };
			const entry = new TranscriptionEntry({ role, data });
			expect(entry.role).toBe(role);
			expect(entry.data).toBe(data);
		});
	}

	const blobs = [
		{ data: "YQ==", mimeType: "audio/pcm" },
		{ data: "", mimeType: "text/plain" },
		{ data: "Yg==", mimeType: "image/png" },
	];

	for (const [i, blob] of blobs.entries()) {
		it(`blob data combo #${i}`, () => {
			const entry = new TranscriptionEntry({ data: blob });
			expect(entry.role).toBeUndefined();
			expect(entry.data).toEqual(blob);
		});
	}

	it("stores empty parts content", () => {
		const data = { role: "model" as const, parts: [] };
		const entry = new TranscriptionEntry({ role: "model", data });
		expect(entry.data).toEqual(data);
	});
});
