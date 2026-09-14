import { afterEach, describe, expect, it, vi } from "vitest";
import { ActiveStreamingTool } from "../../agents/active-streaming-tool";
import type { BaseAgent } from "../../agents/base-agent";
import { BaseAgent as BaseAgentClass } from "../../agents/base-agent";
import { CallbackContext } from "../../agents/callback-context";
import { InvocationContext } from "../../agents/invocation-context";
import { LiveRequest, LiveRequestQueue } from "../../agents/live-request-queue";
import { LoopAgent } from "../../agents/loop-agent";
import {
	createBranchContextForSubAgent,
	mergeAgentRun,
	ParallelAgent,
} from "../../agents/parallel-agent";
import { ReadonlyContext } from "../../agents/readonly-context";
import { RunConfig, StreamingMode } from "../../agents/run-config";
import { SequentialAgent } from "../../agents/sequential-agent";
import { TranscriptionEntry } from "../../agents/transcription-entry";
import { Event } from "../../events/event";
import { EventActions } from "../../events/event-actions";
import { PluginManager } from "../../plugins/plugin-manager";
import type { BaseSessionService } from "../../sessions/base-session-service";
import type { Session } from "../../sessions/session";

class MockSubAgent extends BaseAgentClass {
	runAsync = vi.fn();
	runLive = vi.fn();

	constructor(name: string) {
		super({ name, description: `mock-${name}` });
	}
}

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

function makeInvocation(
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

const mockCtx = {
	invocationId: "inv-ctx",
	agent: {} as any,
	branch: undefined,
	session: makeSession({ id: "ses", appName: "test-app", userId: "u" }),
	endInvocation: false,
	createChildContext: vi.fn(),
	pluginManager: new PluginManager(),
	sessionService: {} as BaseSessionService,
} as unknown as InvocationContext;

describe("ActiveStreamingTool leftover option matrix", () => {
	const taskCombos: Array<{
		label: string;
		task?: Promise<unknown>;
		stream?: LiveRequestQueue;
	}> = [
		{ label: "both omitted" },
		{ label: "task only", task: Promise.resolve("done") },
		{ label: "stream only", stream: new LiveRequestQueue() },
		{
			label: "both set",
			task: Promise.resolve(1),
			stream: new LiveRequestQueue(),
		},
		{ label: "pending task", task: new Promise(() => {}) },
		{ label: "empty options object" },
	];

	for (const { label, task, stream } of taskCombos) {
		it(`constructs ActiveStreamingTool: ${label}`, () => {
			const tool =
				label === "empty options object"
					? new ActiveStreamingTool({})
					: new ActiveStreamingTool(
							task === undefined && stream === undefined
								? undefined
								: { task, stream },
						);
			expect(tool.task).toBe(task);
			expect(tool.stream).toBe(stream);
		});
	}

	it("mutates task and stream after construction", async () => {
		const tool = new ActiveStreamingTool();
		const stream = new LiveRequestQueue();
		const task = Promise.resolve("ok");
		tool.task = task;
		tool.stream = stream;
		expect(await tool.task).toBe("ok");
		expect(tool.stream).toBe(stream);
	});
});

describe("RunConfig leftover modality / transcription matrices", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	const modalityCombos = [
		undefined,
		[],
		["TEXT"],
		["AUDIO"],
		["TEXT", "AUDIO"],
		["AUDIO", "TEXT", "IMAGE"],
	];

	for (const [i, responseModalities] of modalityCombos.entries()) {
		it(`responseModalities combo #${i}`, () => {
			const cfg = new RunConfig({ responseModalities });
			expect(cfg.responseModalities).toEqual(responseModalities);
			expect(cfg.streamingMode).toBe(StreamingMode.NONE);
			expect(cfg.maxLlmCalls).toBe(500);
		});
	}

	const transcriptionCombos = [
		{ input: undefined, output: undefined },
		{ input: {}, output: undefined },
		{ input: undefined, output: {} },
		{ input: { languageCode: "en" }, output: { languageCode: "es" } },
		{ input: { languageCode: "" }, output: { languageCode: "" } },
	];

	for (const [i, combo] of transcriptionCombos.entries()) {
		it(`audio transcription combo #${i}`, () => {
			const cfg = new RunConfig({
				inputAudioTranscription: combo.input as any,
				outputAudioTranscription: combo.output as any,
			});
			expect(cfg.inputAudioTranscription).toEqual(combo.input);
			expect(cfg.outputAudioTranscription).toEqual(combo.output);
		});
	}

	const streamingFlagMatrix = [
		{ streamingMode: StreamingMode.SSE, supportCFC: true },
		{ streamingMode: StreamingMode.SSE, supportCFC: false },
		{ streamingMode: StreamingMode.BIDI, supportCFC: true },
		{ streamingMode: StreamingMode.BIDI, supportCFC: false },
		{ streamingMode: StreamingMode.NONE, supportCFC: true },
	];

	for (const combo of streamingFlagMatrix) {
		it(`streaming+CFC ${combo.streamingMode}/${combo.supportCFC}`, () => {
			const cfg = new RunConfig(combo);
			expect(cfg.streamingMode).toBe(combo.streamingMode);
			expect(cfg.supportCFC).toBe(combo.supportCFC);
		});
	}

	it("realtimeInputConfig and proactivity pass-through", () => {
		const realtimeInputConfig = {
			activityHandling: "START_OF_ACTIVITY",
		} as any;
		const proactivity = { proactiveAudio: true } as any;
		const cfg = new RunConfig({
			realtimeInputConfig,
			proactivity,
			enableAffectiveDialog: true,
			saveInputBlobsAsArtifacts: true,
		});
		expect(cfg.realtimeInputConfig).toBe(realtimeInputConfig);
		expect(cfg.proactivity).toBe(proactivity);
		expect(cfg.enableAffectiveDialog).toBe(true);
		expect(cfg.saveInputBlobsAsArtifacts).toBe(true);
	});

	it("MAX_SAFE_INTEGER - 1 is accepted without warn", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const cfg = new RunConfig({ maxLlmCalls: Number.MAX_SAFE_INTEGER - 1 });
		expect(cfg.maxLlmCalls).toBe(Number.MAX_SAFE_INTEGER - 1);
		expect(warn).not.toHaveBeenCalled();
	});
});

describe("TranscriptionEntry leftover content matrices", () => {
	const contentShapes = [
		{ role: "user" as const, parts: [{ text: "" }] },
		{ role: "model" as const, parts: [{ text: "a" }, { text: "b" }] },
		{
			role: "user" as const,
			parts: [{ inlineData: { mimeType: "audio/pcm", data: "YQ==" } }],
		},
		{ role: "model" as const, parts: [] },
	];

	for (const [i, data] of contentShapes.entries()) {
		it(`Content shape #${i} with role model`, () => {
			const entry = new TranscriptionEntry({ role: "model", data });
			expect(entry.role).toBe("model");
			expect(entry.data).toBe(data);
		});
	}

	const blobMimeTypes = [
		"audio/pcm",
		"audio/wav",
		"application/octet-stream",
		"image/jpeg",
	];
	for (const mimeType of blobMimeTypes) {
		it(`blob mimeType ${mimeType}`, () => {
			const data = { data: "YQ==", mimeType };
			const entry = new TranscriptionEntry({ data });
			expect(entry.data).toEqual(data);
			expect(entry.role).toBeUndefined();
		});
	}
});

describe("LiveRequestQueue leftover early-waiter / close matrices", () => {
	it("send with close:false does not close the queue", () => {
		const queue = new LiveRequestQueue();
		queue.send(new LiveRequest({ close: false }));
		queue.sendContent({ role: "user", parts: [{ text: "still open" }] });
		expect(true).toBe(true);
	});

	it("get after close sentinel still waits for next close if already drained", async () => {
		const queue = new LiveRequestQueue();
		queue.close();
		expect((await queue.get()).close).toBe(true);
	});

	it("sendContent then sendRealtime then close order", async () => {
		const queue = new LiveRequestQueue();
		queue.sendContent({ role: "user", parts: [{ text: "c" }] });
		queue.sendRealtime({ data: "Yg==", mimeType: "text/plain" });
		queue.close();
		expect((await queue.get()).content?.parts?.[0]?.text).toBe("c");
		expect((await queue.get()).blob?.data).toBe("Yg==");
		expect((await queue.get()).close).toBe(true);
	});

	it("LiveRequest with both content and close true closes queue", async () => {
		const queue = new LiveRequestQueue();
		queue.send(
			new LiveRequest({
				content: { role: "user", parts: [{ text: "bye" }] },
				close: true,
			}),
		);
		const req = await queue.get();
		expect(req.close).toBe(true);
		expect(req.content?.parts?.[0]?.text).toBe("bye");
		expect(() => queue.sendContent({ role: "user", parts: [] })).toThrow(
			/Queue is closed/,
		);
	});
});

describe("CallbackContext / ReadonlyContext leftover edges", () => {
	it("loadArtifact returns undefined from service", async () => {
		const loadArtifact = vi.fn().mockResolvedValue(undefined);
		const ctx = new CallbackContext(
			makeInvocation({
				sessionService: {} as BaseSessionService,
				pluginManager: new PluginManager(),
				agent: makeAgent("agent"),
				session: makeSession(),
				artifactService: { loadArtifact, saveArtifact: vi.fn() } as any,
			}),
		);
		await expect(ctx.loadArtifact("missing.bin")).resolves.toBeUndefined();
	});

	it("accumulates multiple artifactDelta entries", async () => {
		const saveArtifact = vi
			.fn()
			.mockResolvedValueOnce(1)
			.mockResolvedValueOnce(2)
			.mockResolvedValueOnce(3);
		const ctx = new CallbackContext(
			makeInvocation({
				sessionService: {} as BaseSessionService,
				pluginManager: new PluginManager(),
				agent: makeAgent("agent"),
				session: makeSession(),
				artifactService: { loadArtifact: vi.fn(), saveArtifact } as any,
			}),
		);
		await ctx.saveArtifact("a.txt", { text: "1" });
		await ctx.saveArtifact("b.txt", { text: "2" });
		await ctx.saveArtifact("a.txt", { text: "3" });
		expect(ctx.eventActions.artifactDelta).toEqual({
			"a.txt": 3,
			"b.txt": 2,
		});
	});

	it("invocationContext getter returns same instance", () => {
		const inv = makeInvocation();
		const ctx = new CallbackContext(inv);
		expect(ctx.invocationContext).toBe(inv);
	});

	it("ReadonlyContext state freeze rejects mutation", () => {
		const inv = makeInvocation({
			sessionService: {} as BaseSessionService,
			pluginManager: new PluginManager(),
			agent: makeAgent("agent"),
			session: makeSession({ state: { k: 1 } }),
		});
		const ctx = new ReadonlyContext(inv);
		expect(() => {
			(ctx.state as any).k = 2;
		}).toThrow();
		expect(ctx.state.k).toBe(1);
	});

	const sessionIds = ["s1", "s-2", "session_long_id", "0"];
	for (const id of sessionIds) {
		it(`ReadonlyContext sessionId ${id}`, () => {
			const inv = makeInvocation({
				sessionService: {} as BaseSessionService,
				pluginManager: new PluginManager(),
				agent: makeAgent("agent"),
				session: makeSession({ id }),
			});
			expect(new ReadonlyContext(inv).sessionId).toBe(id);
		});
	}

	it("CallbackContext without options uses empty EventActions delta", () => {
		const ctx = new CallbackContext(makeInvocation());
		expect(ctx.eventActions).toBeInstanceOf(EventActions);
		expect(ctx.eventActions.stateDelta).toEqual({});
		expect(ctx.eventActions.artifactDelta).toEqual({});
	});
});

describe("SequentialAgent leftover construction / empty / early-exit", () => {
	const invalidNames = ["", "1bad", "has-dash", "has space", "user"];
	for (const name of invalidNames) {
		it(`rejects invalid SequentialAgent name: ${JSON.stringify(name)}`, () => {
			expect(
				() =>
					new SequentialAgent({
						name,
						description: "d",
					}),
			).toThrow();
		});
	}

	it("constructs with empty subAgents and yields nothing", async () => {
		const agent = new SequentialAgent({
			name: "empty_seq",
			description: "d",
			subAgents: [],
		});
		expect(agent.subAgents).toEqual([]);
		const events: Event[] = [];
		for await (const event of agent["runAsyncImpl"](mockCtx)) {
			events.push(event);
		}
		expect(events).toEqual([]);
	});

	it("omitted subAgents defaults to empty array", () => {
		const agent = new SequentialAgent({
			name: "omit_seq",
			description: "d",
		});
		expect(agent.subAgents).toEqual([]);
	});

	it("early consumer exit stops iterating remaining sub-agents", async () => {
		const a = new MockSubAgent("early_a");
		const b = new MockSubAgent("early_b");
		a.runAsync.mockImplementation(async function* () {
			yield new Event({
				author: "early_a",
				content: { parts: [{ text: "1" }] },
			});
			yield new Event({
				author: "early_a",
				content: { parts: [{ text: "2" }] },
			});
		});
		b.runAsync.mockImplementation(async function* () {
			yield new Event({ author: "early_b" });
		});
		const agent = new SequentialAgent({
			name: "early_seq",
			description: "d",
			subAgents: [a, b],
		});
		const gen = agent["runAsyncImpl"](mockCtx);
		const first = await gen.next();
		expect(first.value?.author).toBe("early_a");
		await gen.return?.(undefined as any);
		expect(b.runAsync).not.toHaveBeenCalled();
	});

	it("throws when sub-agent already has a parent (name collision / double attach)", () => {
		const child = new MockSubAgent("shared_child");
		new SequentialAgent({
			name: "parent_a",
			description: "d",
			subAgents: [child],
		});
		expect(
			() =>
				new SequentialAgent({
					name: "parent_b",
					description: "d",
					subAgents: [child],
				}),
		).toThrow(/already has a parent agent/);
	});

	it("findAgent locates nested sequential child by name", () => {
		const leaf = new MockSubAgent("leaf_seq");
		const mid = new SequentialAgent({
			name: "mid_seq",
			description: "m",
			subAgents: [leaf],
		});
		const root = new SequentialAgent({
			name: "root_seq",
			description: "r",
			subAgents: [mid],
		});
		expect(root.findAgent("leaf_seq")).toBe(leaf);
		expect(root.findSubAgent("missing")).toBeUndefined();
	});
});

describe("LoopAgent leftover construction / empty / early-exit", () => {
	it("rejects reserved user name", () => {
		expect(() => new LoopAgent({ name: "user", description: "d" })).toThrow(
			/reserved/,
		);
	});

	const maxCases = [undefined, 1, 2, 3];
	for (const maxIterations of maxCases) {
		it(`stores maxIterations ${String(maxIterations)}`, () => {
			const agent = new LoopAgent({
				name: `loop_${String(maxIterations ?? "undef")}`,
				description: "d",
				maxIterations,
			});
			expect(agent.maxIterations).toBe(maxIterations);
			expect(agent.subAgents).toEqual([]);
		});
	}

	it("empty children with maxIterations yields nothing", async () => {
		const agent = new LoopAgent({
			name: "empty_loop",
			description: "d",
			subAgents: [],
			maxIterations: 3,
		});
		const events: Event[] = [];
		for await (const event of agent["runAsyncImpl"](mockCtx)) {
			events.push(event);
		}
		expect(events).toEqual([]);
	});

	it("early consumer return stops before next iteration", async () => {
		const sub = new MockSubAgent("loop_early");
		let calls = 0;
		sub.runAsync.mockImplementation(async function* () {
			calls++;
			yield new Event({
				author: "loop_early",
				content: { parts: [{ text: String(calls) }] },
			});
		});
		const agent = new LoopAgent({
			name: "loop_early_root",
			description: "d",
			subAgents: [sub],
			maxIterations: 5,
		});
		const gen = agent["runAsyncImpl"](mockCtx);
		await gen.next();
		await gen.return?.(undefined as any);
		expect(calls).toBe(1);
	});

	it("runLiveImpl throws not supported", async () => {
		const agent = new LoopAgent({ name: "live_loop", description: "d" });
		await expect(async () => {
			for await (const _ of agent["runLiveImpl"](mockCtx)) {
			}
		}).rejects.toThrow(/not supported yet for LoopAgent/);
	});

	it("escalate from second sub-agent stops remaining siblings this iteration", async () => {
		const a = new MockSubAgent("la");
		const b = new MockSubAgent("lb");
		const c = new MockSubAgent("lc");
		a.runAsync.mockImplementation(async function* () {
			yield new Event({ author: "la" });
		});
		b.runAsync.mockImplementation(async function* () {
			yield new Event({
				author: "lb",
				actions: { escalate: true, stateDelta: {}, artifactDelta: {} },
			});
		});
		c.runAsync.mockImplementation(async function* () {
			yield new Event({ author: "lc" });
		});
		const agent = new LoopAgent({
			name: "esc_mid",
			description: "d",
			subAgents: [a, b, c],
			maxIterations: 4,
		});
		const authors: string[] = [];
		for await (const event of agent["runAsyncImpl"](mockCtx)) {
			authors.push(event.author);
		}
		expect(authors).toEqual(["la", "lb"]);
		expect(c.runAsync).not.toHaveBeenCalled();
	});
});

describe("ParallelAgent leftover construction / empty / merge early-exit", () => {
	it("rejects invalid parallel name", () => {
		expect(
			() => new ParallelAgent({ name: "bad-name", description: "d" }),
		).toThrow(/invalid agent name/);
	});

	it("empty subAgents mergeAgentRun returns immediately", async () => {
		const events: Event[] = [];
		for await (const event of mergeAgentRun([])) {
			events.push(event);
		}
		expect(events).toEqual([]);
	});

	it("runLiveImpl throws not supported", async () => {
		const agent = new ParallelAgent({ name: "live_par", description: "d" });
		await expect(async () => {
			for await (const _ of agent["runLiveImpl"](mockCtx)) {
			}
		}).rejects.toThrow(/not supported yet for ParallelAgent/);
	});

	it("early consumer exit of mergeAgentRun does not hang", async () => {
		async function* slow() {
			yield new Event({ author: "s1" });
			yield new Event({ author: "s2" });
		}
		async function* other() {
			yield new Event({ author: "o1" });
		}
		const gen = mergeAgentRun([slow(), other()]);
		const first = await gen.next();
		expect(first.done).toBe(false);
		await gen.return?.(undefined as any);
	});

	it("createBranchContextForSubAgent nests under existing branch", () => {
		const parent = new ParallelAgent({ name: "par_root", description: "d" });
		const child = new MockSubAgent("par_child");
		const inv = makeInvocation({
			sessionService: {} as BaseSessionService,
			pluginManager: new PluginManager(),
			agent: makeAgent("root"),
			session: makeSession(),
			branch: "outer",
			invocationId: "same-id",
		});
		const branched = createBranchContextForSubAgent(parent, child, inv);
		expect(branched.branch).toBe("outer.par_root.par_child");
		expect(branched.invocationId).toBe("same-id");
		expect(branched.agent).toBe(child);
	});

	it("throws when attaching child that already has parent", () => {
		const child = new MockSubAgent("par_shared");
		new ParallelAgent({
			name: "par_a",
			description: "d",
			subAgents: [child],
		});
		expect(
			() =>
				new ParallelAgent({
					name: "par_b",
					description: "d",
					subAgents: [child],
				}),
		).toThrow(/already has a parent agent/);
	});

	it("single generator merge yields all events in order", async () => {
		async function* only() {
			yield new Event({ author: "only", content: { parts: [{ text: "a" }] } });
			yield new Event({ author: "only", content: { parts: [{ text: "b" }] } });
		}
		const texts: string[] = [];
		for await (const event of mergeAgentRun([only()])) {
			texts.push(event.content?.parts?.[0]?.text as string);
		}
		expect(texts).toEqual(["a", "b"]);
	});
});
