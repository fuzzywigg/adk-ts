import { describe, expect, it } from "vitest";
import { Event } from "../../events/event";
import { InMemorySessionService } from "../../sessions/in-memory-session-service";

/**
 * Fifteenth leftover: in-memory independent `if (numRecentEvents)` /
 * `if (afterTimestamp)` — string "2"/"0" are truthy (numeric 0 skips,
 * thirteenth). Both filters can compose.
 */
describe("in-memory numRecent/afterTs string truthy fifteenth leftover", () => {
	async function seeded() {
		const service = new InMemorySessionService();
		const session = await service.createSession("app", "u", {}, "s");
		for (const [i, ts] of [10, 20, 30, 40].entries()) {
			await service.appendEvent(
				session,
				new Event({
					author: "agent",
					invocationId: `inv-${i}`,
					timestamp: ts,
					content: { role: "model", parts: [{ text: `e${i}` }] },
				}),
			);
		}
		return service;
	}

	it('numRecentEvents: "2" is truthy and slices last two', async () => {
		const service = await seeded();
		const got = await service.getSession("app", "u", "s", {
			numRecentEvents: "2" as any,
		});
		expect(got?.events.map((e) => e.timestamp)).toEqual([30, 40]);
	});

	it('afterTimestamp: "0" is truthy so comparison runs', async () => {
		const service = await seeded();
		const got = await service.getSession("app", "u", "s", {
			afterTimestamp: "0" as any,
		});
		// all timestamps > 0 (coerced), so walk finds none < "0" → full list
		expect(got?.events.map((e) => e.timestamp)).toEqual([10, 20, 30, 40]);
	});

	it('afterTimestamp: "25" filters then composes with numRecentEvents: "2"', async () => {
		const service = await seeded();
		const got = await service.getSession("app", "u", "s", {
			numRecentEvents: "2" as any,
			afterTimestamp: "25" as any,
		});
		// first slice(-"2") → [30,40]; then afterTimestamp "25" keeps both
		expect(got?.events.map((e) => e.timestamp)).toEqual([30, 40]);
	});

	it("numeric 0 still skips both gates (control)", async () => {
		const service = await seeded();
		const got = await service.getSession("app", "u", "s", {
			numRecentEvents: 0,
			afterTimestamp: 0,
		});
		expect(got?.events).toHaveLength(4);
	});
});
