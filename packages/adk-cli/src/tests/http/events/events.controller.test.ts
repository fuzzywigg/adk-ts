import { describe, expect, it, vi } from "vitest";
import { EventsController } from "../../../http/events/events.controller";

describe("EventsController", () => {
	it("decodes agent id and delegates getEvents", async () => {
		const events = {
			getEvents: vi.fn(async () => ({
				events: [{ author: "user", content: "hi" }],
			})),
		};
		const controller = new EventsController(events as never);

		await expect(
			controller.getEvents(encodeURIComponent("/agents/demo"), "sess-1"),
		).resolves.toEqual({
			events: [{ author: "user", content: "hi" }],
		});
		expect(events.getEvents).toHaveBeenCalledWith("/agents/demo", "sess-1");
	});
});
