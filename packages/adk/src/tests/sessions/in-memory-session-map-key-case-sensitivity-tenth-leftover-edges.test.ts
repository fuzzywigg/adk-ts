import { describe, expect, it } from "vitest";
import { InMemorySessionService } from "../../sessions/in-memory-session-service";

/**
 * Tenth leftover: nested Maps key on appName/userId/sessionId with === —
 * App vs app are distinct stores (unlike URI-style case folding).
 */
describe("in-memory session Map key case-sensitivity tenth leftover edges", () => {
	it("getSession misses differently-cased appName", async () => {
		const service = new InMemorySessionService();
		await service.createSession("App", "user", { k: 1 }, "sess");
		expect(await service.getSession("app", "user", "sess")).toBeUndefined();
		expect(await service.getSession("APP", "user", "sess")).toBeUndefined();
		expect((await service.getSession("App", "user", "sess"))?.state.k).toBe(1);
	});

	it("getSession misses differently-cased userId", async () => {
		const service = new InMemorySessionService();
		await service.createSession("app", "User", {}, "sess");
		expect(await service.getSession("app", "user", "sess")).toBeUndefined();
		expect(await service.getSession("app", "USER", "sess")).toBeUndefined();
		expect(await service.getSession("app", "User", "sess")).toBeDefined();
	});

	it("getSession misses differently-cased sessionId", async () => {
		const service = new InMemorySessionService();
		const created = await service.createSession("app", "user", {}, "sid-Case");
		expect(created.id).toBe("sid-Case");
		expect(await service.getSession("app", "user", created.id)).toBeDefined();
		expect(await service.getSession("app", "user", "sid-case")).toBeUndefined();
		expect(await service.getSession("app", "user", "SID-CASE")).toBeUndefined();
		expect((await service.getSession("app", "user", "sid-Case"))?.id).toBe(
			"sid-Case",
		);
	});

	it("listSessions is scoped to exact userId case", async () => {
		const service = new InMemorySessionService();
		await service.createSession("app", "User", {}, "s1");
		expect((await service.listSessions("app", "user")).sessions).toEqual([]);
		expect((await service.listSessions("app", "User")).sessions).toHaveLength(
			1,
		);
	});

	it("deleteSession no-ops on case-mismatched ids", async () => {
		const service = new InMemorySessionService();
		await service.createSession("app", "user", {}, "sid-Case");
		await service.deleteSession("app", "user", "sid-case");
		expect(await service.getSession("app", "user", "sid-Case")).toBeDefined();
		await service.deleteSession("app", "user", "sid-Case");
		expect(await service.getSession("app", "user", "sid-Case")).toBeUndefined();
	});
});
