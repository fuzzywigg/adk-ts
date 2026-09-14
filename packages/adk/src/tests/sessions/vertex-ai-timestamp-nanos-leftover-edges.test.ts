import { describe, expect, it } from "vitest";
import { Event } from "../../events/event";
import { VertexAiSessionService } from "../../sessions/vertex-ai-session-service";

/**
 * Leftover: convertEventToJson nanos from fractional timestamp;
 * integer timestamps → nanos 0; near-1.0 fractional boundaries.
 */
describe("vertex-ai convertEventToJson timestamp-nanos leftover edges", () => {
	const service = new VertexAiSessionService({ agentEngineId: "1" });
	const convert = (timestamp: number) =>
		(service as any).convertEventToJson(
			new Event({
				author: "agent",
				invocationId: "inv",
				timestamp,
			}),
		).timestamp;

	it.each([
		{ label: "integer", ts: 42, seconds: 42, nanos: 0 },
		{ label: "0", ts: 0, seconds: 0, nanos: 0 },
		{ label: "half second", ts: 10.5, seconds: 10, nanos: 500_000_000 },
		{ label: "1ns-ish", ts: 1.000000001, seconds: 1, nanos: 1 },
		{ label: "negative floor", ts: -1.25, seconds: -2, nanos: 750_000_000 },
	])("$label → seconds/nanos", ({ ts, seconds, nanos }) => {
		const stamp = convert(ts);
		expect(stamp.seconds).toBe(seconds);
		expect(stamp.nanos).toBe(nanos);
	});

	it("near-1.0 fractional uses Math.floor (float precision may drop 1ns)", () => {
		const ts = 5.999999999;
		const stamp = convert(ts);
		expect(stamp.seconds).toBe(5);
		expect(stamp.nanos).toBe(Math.floor((ts - Math.floor(ts)) * 1_000_000_000));
		expect(stamp.nanos).toBeGreaterThanOrEqual(999_999_998);
		expect(stamp.nanos).toBeLessThanOrEqual(999_999_999);
	});

	it("Math.floor nanos truncates sub-nanosecond fractions", () => {
		const stamp = convert(3 + 1.5e-10);
		expect(stamp.seconds).toBe(3);
		expect(stamp.nanos).toBe(0);
	});
});
