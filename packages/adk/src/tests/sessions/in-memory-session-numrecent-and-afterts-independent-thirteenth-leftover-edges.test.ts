import { describe, expect, it } from "vitest";
import { Event } from "../../events/event";
import { InMemorySessionService } from "../../sessions/in-memory-session-service";

/**
 * Thirteenth leftover: in-memory getSession applies numRecentEvents AND
 * afterTimestamp independently (not elif like Vertex). Falsy 0 skips each gate.
 */
describe("in-memory numRecentEvents and afterTimestamp independent thirteenth leftover", () => {
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

	it("truthy numRecentEvents then afterTimestamp both apply", async () => {
		const service = await seeded();
		const both = await service.getSession("app", "u", "s", {
			numRecentEvents: 2,
			afterTimestamp: 15,
		});
		const afterOnly = await service.getSession("app", "u", "s", {
			afterTimestamp: 15,
		});
		expect(both?.events.map((e) => e.timestamp)).toEqual([30, 40]);
		expect(afterOnly?.events.map((e) => e.timestamp)).toEqual([20, 30, 40]);
	});

	it("numRecentEvents: 0 is falsy so only afterTimestamp runs", async () => {
		const service = await seeded();
		const got = await service.getSession("app", "u", "s", {
			numRecentEvents: 0,
			afterTimestamp: 25,
		});
		expect(got?.events.map((e) => e.timestamp)).toEqual([30, 40]);
	});

	it("afterTimestamp: 0 is falsy so only numRecentEvents runs", async () => {
		const service = await seeded();
		const got = await service.getSession("app", "u", "s", {
			numRecentEvents: 2,
			afterTimestamp: 0,
		});
		expect(got?.events.map((e) => e.timestamp)).toEqual([30, 40]);
	});

	it("both 0 leave full history", async () => {
		const service = await seeded();
		const got = await service.getSession("app", "u", "s", {
			numRecentEvents: 0,
			afterTimestamp: 0,
		});
		expect(got?.events).toHaveLength(4);
	});
});
