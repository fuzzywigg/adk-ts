import { beforeEach, describe, expect, it } from "vitest";
import { InMemorySessionService } from "../../sessions/in-memory-session-service";

/**
 * Fifteenth leftover: `if (config.afterTimestamp)` — string "0" is truthy and
 * enters the walk; numeric 0 skips (thirteenth).
 */
describe("in-memory afterTimestamp string-zero truthy fifteenth leftover", () => {
	let memory: InMemorySessionService;

	beforeEach(() => {
		memory = new InMemorySessionService();
	});

	it('afterTimestamp: "0" filters events with timestamp < "0"', async () => {
		const session = await memory.createSession("app", "u", {}, "s1");
		for (const [id, ts, text] of [
			["e0", -1, "neg"],
			["e1", 1, "pos1"],
			["e2", 2, "pos2"],
		] as const) {
			await memory.appendEvent(session, {
				id,
				author: "user",
				timestamp: ts,
				content: { parts: [{ text }] },
			} as any);
		}

		const withString = await memory.getSession("app", "u", "s1", {
			afterTimestamp: "0" as any,
		});
		expect(withString?.events.map((e) => e.content?.parts?.[0]?.text)).toEqual([
			"pos1",
			"pos2",
		]);

		const withNumeric = await memory.getSession("app", "u", "s1", {
			afterTimestamp: 0,
		});
		expect(withNumeric?.events.map((e) => e.content?.parts?.[0]?.text)).toEqual(
			["neg", "pos1", "pos2"],
		);
	});
});
