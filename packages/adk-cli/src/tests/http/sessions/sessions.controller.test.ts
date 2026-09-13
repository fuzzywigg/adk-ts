import { describe, expect, it, vi } from "vitest";
import { SessionsController } from "../../../http/sessions/sessions.controller";

describe("SessionsController", () => {
	it("decodes agent id and lists sessions", async () => {
		const sessions = {
			listSessions: vi.fn(async () => ({ sessions: [{ id: "s1" }] })),
			createSession: vi.fn(),
			deleteSession: vi.fn(),
			switchSession: vi.fn(),
		};
		const controller = new SessionsController(sessions as never);

		await expect(
			controller.listSessions(encodeURIComponent("/agents/demo")),
		).resolves.toEqual({ sessions: [{ id: "s1" }] });
		expect(sessions.listSessions).toHaveBeenCalledWith("/agents/demo");
	});

	it("forwards create, delete, and switch with decoded agent path", async () => {
		const sessions = {
			listSessions: vi.fn(),
			createSession: vi.fn(async () => ({ id: "custom" })),
			deleteSession: vi.fn(async () => ({ success: true })),
			switchSession: vi.fn(async () => ({ success: true })),
		};
		const controller = new SessionsController(sessions as never);
		const encoded = encodeURIComponent("/agents/a b");

		await expect(
			controller.createSession(encoded, {
				state: { x: 1 },
				sessionId: "custom",
			}),
		).resolves.toEqual({ id: "custom" });
		expect(sessions.createSession).toHaveBeenCalledWith("/agents/a b", {
			state: { x: 1 },
			sessionId: "custom",
		});

		await expect(controller.deleteSession(encoded, "s1")).resolves.toEqual({
			success: true,
		});
		expect(sessions.deleteSession).toHaveBeenCalledWith("/agents/a b", "s1");

		await expect(controller.switchSession(encoded, "s2")).resolves.toEqual({
			success: true,
		});
		expect(sessions.switchSession).toHaveBeenCalledWith("/agents/a b", "s2");
	});

	it("decodes nested encoded path segments and empty bodies", async () => {
		const sessions = {
			listSessions: vi.fn(async () => ({ sessions: [] })),
			createSession: vi.fn(async () => ({ id: "new" })),
			deleteSession: vi.fn(async () => ({ success: true })),
			switchSession: vi.fn(async () => ({ success: true })),
		};
		const controller = new SessionsController(sessions as never);
		const nested = encodeURIComponent("/agents/demo%2Fnested");

		await expect(controller.listSessions(nested)).resolves.toEqual({
			sessions: [],
		});
		expect(sessions.listSessions).toHaveBeenCalledWith("/agents/demo%2Fnested");

		await expect(controller.createSession(nested, {})).resolves.toEqual({
			id: "new",
		});
		expect(sessions.createSession).toHaveBeenCalledWith(
			"/agents/demo%2Fnested",
			{},
		);

		await expect(
			controller.deleteSession(encodeURIComponent(""), "s-empty"),
		).resolves.toEqual({ success: true });
		expect(sessions.deleteSession).toHaveBeenCalledWith("", "s-empty");
	});
});
