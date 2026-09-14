import { describe, expect, it } from "vitest";
import { InMemorySessionService } from "../../sessions/in-memory-session-service";

/**
 * Thirteenth leftover: createSessionImpl uses `sessionId?.trim() || randomUUID()`.
 * Whitespace-only ids generate a UUID; padded ids keep the trimmed value.
 */
describe("in-memory sessionId trim-or-uuid thirteenth leftover edges", () => {
	it.each([
		"",
		"   ",
		"\t",
		"\n",
	])("falsy-after-trim sessionId %j generates a UUID", async (sessionId) => {
		const service = new InMemorySessionService();
		const session = await service.createSession("app", "u", {}, sessionId);
		expect(session.id).not.toBe(sessionId);
		expect(session.id.length).toBeGreaterThan(8);
		expect(await service.getSession("app", "u", session.id)).toBeDefined();
		expect(await service.getSession("app", "u", sessionId)).toBeUndefined();
	});

	it("pads are stripped so lookup uses the trimmed id", async () => {
		const service = new InMemorySessionService();
		const session = await service.createSession("app", "u", {}, "  sid  ");
		expect(session.id).toBe("sid");
		expect(await service.getSession("app", "u", "sid")).toBeDefined();
		expect(await service.getSession("app", "u", "  sid  ")).toBeUndefined();
	});

	it('keeps truthy id "0" (no trim collapse)', async () => {
		const service = new InMemorySessionService();
		const session = await service.createSession("app", "u", {}, "0");
		expect(session.id).toBe("0");
	});

	it("omitted sessionId still generates a UUID (control)", async () => {
		const service = new InMemorySessionService();
		const session = await service.createSession("app", "u");
		expect(session.id.length).toBeGreaterThan(8);
	});
});
