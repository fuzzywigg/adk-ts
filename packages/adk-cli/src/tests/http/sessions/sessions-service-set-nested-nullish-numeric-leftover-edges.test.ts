import { InMemorySessionService } from "@iqai/adk";
import { describe, expect, it, vi } from "vitest";
import type { LoadedAgent } from "../../../common/types";
import { SessionsService } from "../../../http/sessions/sessions.service";

function makeLoaded(overrides: Partial<LoadedAgent> = {}): LoadedAgent {
	return {
		appName: "adk-server",
		userId: "user_demo",
		sessionId: "nested",
		agent: { name: "demo" } as LoadedAgent["agent"],
		runner: {} as LoadedAgent["runner"],
		...overrides,
	} as LoadedAgent;
}

/**
 * Leftover: == null does not treat 0/false/""; "00" is numeric; empty join uses <root>.
 */
describe("SessionsService setNestedValue nullish leftover edges", () => {
	function serviceWith(
		sessionService: InMemorySessionService,
		hotReload?: { broadcastState: ReturnType<typeof vi.fn> },
	) {
		const loaded = makeLoaded();
		const svc = new SessionsService(
			{ getLoadedAgents: vi.fn(), startAgent: vi.fn() } as never,
			sessionService,
			true,
			hotReload as never,
		);
		return { svc, loaded };
	}

	it("does not replace numeric 0 slot with {} when descending", async () => {
		const sessionService = new InMemorySessionService();
		const { svc, loaded } = serviceWith(sessionService);
		await sessionService.createSession(
			loaded.appName,
			loaded.userId,
			{ items: [0] },
			"nested",
		);

		await svc.updateSessionState(loaded, "nested", "items.0.x", "ok");
		const state = await svc.getSessionState(loaded, "nested");
		expect(state.sessionState).toEqual({ items: [{ x: "ok" }] });
	});

	it("replaces null slots based on nextIsIndex", async () => {
		const sessionService = new InMemorySessionService();
		const { svc, loaded } = serviceWith(sessionService);
		await sessionService.createSession(
			loaded.appName,
			loaded.userId,
			{ items: [null], bag: null },
			"nested",
		);

		await svc.updateSessionState(loaded, "nested", "items.0.id", 1);
		await svc.updateSessionState(loaded, "nested", "bag.k", "v");
		const state = await svc.getSessionState(loaded, "nested");
		expect(state.sessionState).toEqual({
			items: [{ id: 1 }],
			bag: { k: "v" },
		});
	});

	it("sets numeric last key on a plain object as property '0'", async () => {
		const sessionService = new InMemorySessionService();
		const { svc, loaded } = serviceWith(sessionService);
		await sessionService.createSession(
			loaded.appName,
			loaded.userId,
			{ bag: { a: 1 } },
			"nested",
		);

		await svc.updateSessionState(loaded, "nested", "bag.0", "zero");
		const state = await svc.getSessionState(loaded, "nested");
		expect((state.sessionState.bag as Record<string, unknown>)["0"]).toBe(
			"zero",
		);
	});

	it("throws cannot index into non-array for path starting with 0.a", async () => {
		const sessionService = new InMemorySessionService();
		const { svc, loaded } = serviceWith(sessionService);
		await sessionService.createSession(
			loaded.appName,
			loaded.userId,
			{ a: 1 },
			"nested",
		);

		await expect(
			svc.updateSessionState(loaded, "nested", "0.a", 1),
		).rejects.toThrow(/cannot index into non-array/);
	});

	it("non-numeric key on array uses <root> when keys.join is empty", async () => {
		const sessionService = new InMemorySessionService();
		const { svc, loaded } = serviceWith(sessionService);
		await sessionService.createSession(
			loaded.appName,
			loaded.userId,
			{ items: [1] },
			"nested",
		);

		await expect(
			svc.updateSessionState(loaded, "nested", "items.name", "x"),
		).rejects.toThrow(/at 'items'/);
	});

	it("treats '00' as a numeric key via /^\\d+$/", async () => {
		const sessionService = new InMemorySessionService();
		const { svc, loaded } = serviceWith(sessionService);
		await sessionService.createSession(
			loaded.appName,
			loaded.userId,
			{ items: ["a"] },
			"nested",
		);

		await svc.updateSessionState(loaded, "nested", "items.00", "b");
		const state = await svc.getSessionState(loaded, "nested");
		expect((state.sessionState.items as unknown[])[0]).toBe("b");
	});
});
