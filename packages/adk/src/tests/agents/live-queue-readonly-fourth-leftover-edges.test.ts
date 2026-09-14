import { describe, expect, it } from "vitest";
import type { Content } from "@google/genai";
import { InvocationContext } from "../../agents/invocation-context";
import { LiveRequest, LiveRequestQueue } from "../../agents/live-request-queue";
import { ReadonlyContext } from "../../agents/readonly-context";
import { PluginManager } from "../../plugins/plugin-manager";
import type { BaseAgent } from "../../agents/base-agent";
import type { BaseSessionService } from "../../sessions/base-session-service";
import type { Session } from "../../sessions/session";

function makeAgent(name: string): BaseAgent {
	return { name } as BaseAgent;
}

function makeSession(state: Record<string, unknown> = {}): Session {
	return {
		id: "session-ro",
		appName: "ro-app",
		userId: "ro-user",
		state,
		events: [],
	} as Session;
}

function makeInvocation(
	overrides: {
		userContent?: Content;
		state?: Record<string, unknown>;
		agentName?: string;
		sessionId?: string;
	} = {},
): InvocationContext {
	return new InvocationContext({
		sessionService: {} as BaseSessionService,
		pluginManager: new PluginManager(),
		agent: makeAgent(overrides.agentName ?? "agent"),
		session: {
			...makeSession(overrides.state),
			id: overrides.sessionId ?? "session-ro",
		} as Session,
		invocationId: "inv-ro",
		userContent: overrides.userContent,
	});
}

describe("LiveRequest fourth leftover edges", () => {
	it("defaults close via || false for omit, undefined, and false", () => {
		expect(new LiveRequest().close).toBe(false);
		expect(new LiveRequest({ close: undefined }).close).toBe(false);
		expect(new LiveRequest({ close: false }).close).toBe(false);
	});

	it("sets close true only when explicitly true", () => {
		expect(new LiveRequest({ close: true }).close).toBe(true);
	});

	it("stores content and blob independently", () => {
		const content = { role: "user", parts: [{ text: "c" }] };
		const blob = { data: "YQ==", mimeType: "audio/pcm" };
		const both = new LiveRequest({ content, blob });
		expect(both.content).toEqual(content);
		expect(both.blob).toEqual(blob);
		expect(both.close).toBe(false);
	});
});

describe("LiveRequestQueue fourth leftover edges — close / send", () => {
	it("close() enqueues a close request for subsequent get()", async () => {
		const queue = new LiveRequestQueue();
		queue.close();
		const req = await queue.get();
		expect(req.close).toBe(true);
	});

	it("send with close true marks queue closed after delivery", async () => {
		const queue = new LiveRequestQueue();
		queue.send(new LiveRequest({ close: true }));
		await queue.get();
		expect(() => queue.sendContent({ parts: [] })).toThrow("Queue is closed");
		expect(() =>
			queue.sendRealtime({ data: "YQ==", mimeType: "text/plain" }),
		).toThrow("Queue is closed");
		expect(() => queue.send(new LiveRequest())).toThrow("Queue is closed");
		expect(() => queue.close()).toThrow("Queue is closed");
	});

	it("sendContent delivers to a waiting getter without buffering", async () => {
		const queue = new LiveRequestQueue();
		const pending = queue.get();
		const content = { role: "user", parts: [{ text: "waited" }] };
		queue.sendContent(content);
		const req = await pending;
		expect(req.content).toEqual(content);
		expect(req.close).toBe(false);
	});

	it("sendRealtime delivers blob to a waiting getter", async () => {
		const queue = new LiveRequestQueue();
		const pending = queue.get();
		const blob = { data: "AQID", mimeType: "application/octet-stream" };
		queue.sendRealtime(blob);
		const req = await pending;
		expect(req.blob).toEqual(blob);
	});

	it("FIFO buffers mixed sendContent / sendRealtime / send", async () => {
		const queue = new LiveRequestQueue();
		queue.sendContent({ role: "user", parts: [{ text: "1" }] });
		queue.sendRealtime({ data: "Mg==", mimeType: "text/plain" });
		queue.send(new LiveRequest({ content: { parts: [{ text: "3" }] } }));
		queue.send(new LiveRequest({ close: true }));

		const a = await queue.get();
		const b = await queue.get();
		const c = await queue.get();
		const d = await queue.get();
		expect(a.content?.parts?.[0]?.text).toBe("1");
		expect(b.blob?.data).toBe("Mg==");
		expect(c.content?.parts?.[0]?.text).toBe("3");
		expect(d.close).toBe(true);
	});

	it("multiple waiters are resolved in arrival order", async () => {
		const queue = new LiveRequestQueue();
		const w1 = queue.get();
		const w2 = queue.get();
		queue.sendContent({ parts: [{ text: "first" }] });
		queue.sendContent({ parts: [{ text: "second" }] });
		const r1 = await w1;
		const r2 = await w2;
		expect(r1.content?.parts?.[0]?.text).toBe("first");
		expect(r2.content?.parts?.[0]?.text).toBe("second");
	});

	it("allows empty LiveRequest sends before close", async () => {
		const queue = new LiveRequestQueue();
		queue.send(new LiveRequest());
		const req = await queue.get();
		expect(req.content).toBeUndefined();
		expect(req.blob).toBeUndefined();
		expect(req.close).toBe(false);
	});

	it("close delivered to waiter then rejects further sends", async () => {
		const queue = new LiveRequestQueue();
		const pending = queue.get();
		queue.close();
		expect((await pending).close).toBe(true);
		expect(() => queue.sendContent({ parts: [] })).toThrow("Queue is closed");
	});
});

describe("ReadonlyContext fourth leftover edges — state freeze", () => {
	it("state is frozen and does not mutate the underlying session", () => {
		const invocation = makeInvocation({ state: { a: 1, b: "two" } });
		const ctx = new ReadonlyContext(invocation);
		expect(Object.isFrozen(ctx.state)).toBe(true);
		expect(ctx.state).toEqual({ a: 1, b: "two" });
		expect(() => {
			(ctx.state as Record<string, unknown>).a = 99;
		}).toThrow();
		expect(invocation.session.state.a).toBe(1);
	});

	it("state snapshot is a shallow copy, not the same object", () => {
		const invocation = makeInvocation({ state: { nested: true } });
		const ctx = new ReadonlyContext(invocation);
		expect(ctx.state).not.toBe(invocation.session.state);
	});

	it("state freeze works for empty session state", () => {
		const ctx = new ReadonlyContext(makeInvocation({ state: {} }));
		expect(Object.isFrozen(ctx.state)).toBe(true);
		expect(ctx.state).toEqual({});
	});

	it("exposes session-derived ids and names", () => {
		const ctx = new ReadonlyContext(
			makeInvocation({
				agentName: "reader",
				sessionId: "sess-99",
				userContent: { role: "user", parts: [{ text: "q" }] },
			}),
		);
		expect(ctx.agentName).toBe("reader");
		expect(ctx.sessionId).toBe("sess-99");
		expect(ctx.appName).toBe("ro-app");
		expect(ctx.userId).toBe("ro-user");
		expect(ctx.invocationId).toBe("inv-ro");
		expect(ctx.userContent?.parts?.[0]?.text).toBe("q");
	});

	it("userContent is undefined when invocation has none", () => {
		const ctx = new ReadonlyContext(makeInvocation());
		expect(ctx.userContent).toBeUndefined();
	});

	it("repeated state access returns freshly frozen snapshots", () => {
		const invocation = makeInvocation({ state: { n: 1 } });
		const ctx = new ReadonlyContext(invocation);
		const first = ctx.state;
		invocation.session.state.n = 2;
		const second = ctx.state;
		expect(first).toEqual({ n: 1 });
		expect(second).toEqual({ n: 2 });
		expect(Object.isFrozen(first)).toBe(true);
		expect(Object.isFrozen(second)).toBe(true);
	});

	it("frozen state rejects defineProperty and delete in strict semantics", () => {
		const ctx = new ReadonlyContext(makeInvocation({ state: { keep: true } }));
		expect(() => {
			Object.defineProperty(ctx.state, "extra", { value: 1 });
		}).toThrow();
		expect(() => {
			delete (ctx.state as Record<string, unknown>).keep;
		}).toThrow();
	});
});
