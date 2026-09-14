import { beforeEach, describe, expect, it } from "vitest";
import { InMemorySessionService } from "../../sessions/in-memory-session-service";

/**
 * Fifteenth leftover: in-memory uses two independent `if`s — string "0"
 * numRecentEvents is truthy (slice(-0) full copy) then afterTimestamp still runs.
 * Vertex elif skips afterTimestamp when numRecent is truthy (fourteenth).
 */
describe("in-memory numRecent string-zero still runs afterTs fifteenth leftover", () => {
	let memory: InMemorySessionService;

	beforeEach(() => {
		memory = new InMemorySessionService();
	});

	it('numRecentEvents: "0" still applies afterTimestamp filter', async () => {
		const session = await memory.createSession("app", "u", {}, "s1");
		for (const [id, ts, text] of [
			["e0", 10, "old"],
			["e1", 20, "mid"],
			["e2", 30, "new"],
			["e3", 40, "newest"],
		] as const) {
			await memory.appendEvent(session, {
				id,
				author: "user",
				timestamp: ts,
				content: { parts: [{ text }] },
			} as any);
		}

		const fetched = await memory.getSession("app", "u", "s1", {
			numRecentEvents: "0" as any,
			afterTimestamp: 25,
		});
		expect(fetched?.events.map((e) => e.content?.parts?.[0]?.text)).toEqual([
			"new",
			"newest",
		]);
	});

	it("numeric 0 numRecent still runs afterTimestamp (control)", async () => {
		const session = await memory.createSession("app", "u", {}, "s2");
		for (const [id, ts, text] of [
			["e0", 10, "old"],
			["e1", 30, "new"],
		] as const) {
			await memory.appendEvent(session, {
				id,
				author: "user",
				timestamp: ts,
				content: { parts: [{ text }] },
			} as any);
		}
		const fetched = await memory.getSession("app", "u", "s2", {
			numRecentEvents: 0,
			afterTimestamp: 20,
		});
		expect(fetched?.events.map((e) => e.content?.parts?.[0]?.text)).toEqual([
			"new",
		]);
	});
});
