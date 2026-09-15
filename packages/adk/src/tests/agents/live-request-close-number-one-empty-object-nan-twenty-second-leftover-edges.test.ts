import { describe, expect, it } from "vitest";
import { LiveRequest, LiveRequestQueue } from "../../agents/live-request-queue";

/**
 * Twenty-second leftover (HEAVY residual complement after open #265 / tip
 * #254): twenty-first pins true/`"true"`/`-0`; #265 pins ±Infinity/`[]`.
 * Assert number `1` / `{}` stick via `if (req.close)`; `NaN` coalesces via
 * `|| false` and does not stick.
 */
describe("LiveRequestQueue close number-one/empty-object/NaN twenty-second leftover", () => {
	it("number 1 close is preserved and sticks _closed", () => {
		expect(new LiveRequest({ close: 1 as any }).close).toBe(1);
		const queue = new LiveRequestQueue();
		queue.send(new LiveRequest({ close: 1 as any }));
		expect(() => queue.send(new LiveRequest())).toThrow("Queue is closed");
	});

	it("empty-object close is truthy and sticks _closed", () => {
		const empty = {};
		expect(new LiveRequest({ close: empty as any }).close).toBe(empty);
		const queue = new LiveRequestQueue();
		queue.send(new LiveRequest({ close: empty as any }));
		expect(() => queue.send(new LiveRequest())).toThrow("Queue is closed");
	});

	it("NaN close coalesces to false and does not stick", () => {
		const req = new LiveRequest({ close: Number.NaN as any });
		expect(req.close).toBe(false);
		const queue = new LiveRequestQueue();
		queue.send(req);
		expect(() =>
			queue.send(new LiveRequest({ content: { parts: [{ text: "ok" }] } })),
		).not.toThrow();
	});

	it("number 1 close request is still deliverable via get()", async () => {
		const queue = new LiveRequestQueue();
		queue.send(new LiveRequest({ close: 1 as any }));
		const got = await queue.get();
		expect(got.close).toBe(1);
		expect(() => queue.send(new LiveRequest())).toThrow("Queue is closed");
	});
});
