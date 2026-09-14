import { describe, expect, it } from "vitest";
import { TelemetryService } from "../telemetry";

/**
 * Leftover: _safeJsonStringify catch for BigInt and toJSON throw —
 * distinct from circular-ref cases already covered.
 */
describe("telemetry safe-json bigint/toJSON leftover edges", () => {
	const service = new TelemetryService();
	const stringify = (v: any) => (service as any)._safeJsonStringify(v);

	it("returns marker for BigInt values", () => {
		expect(stringify(1n)).toBe("<not serializable>");
		expect(stringify({ n: 2n })).toBe("<not serializable>");
	});

	it("returns marker when toJSON throws", () => {
		const boom = {
			toJSON() {
				throw new Error("toJSON boom");
			},
		};
		expect(stringify(boom)).toBe("<not serializable>");
		expect(stringify({ nested: boom })).toBe("<not serializable>");
	});

	it("still serializes plain values and null", () => {
		expect(stringify({ a: 1 })).toBe('{"a":1}');
		expect(stringify(null)).toBe("null");
		expect(stringify([1, "x"])).toBe('[1,"x"]');
	});

	it("circular remains marker (control)", () => {
		const circular: any = {};
		circular.self = circular;
		expect(stringify(circular)).toBe("<not serializable>");
	});
});
