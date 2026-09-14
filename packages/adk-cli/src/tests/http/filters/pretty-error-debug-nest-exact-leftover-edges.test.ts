import { ArgumentsHost } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PrettyErrorFilter } from "../../../http/filters/pretty-error.filter";

function createHost(url = "/agents/demo") {
	const json = vi.fn();
	const status = vi.fn().mockReturnValue({ json });
	const host = {
		switchToHttp: () => ({
			getResponse: () => ({ status, json }),
			getRequest: () => ({ url }),
		}),
	} as unknown as ArgumentsHost;
	return { host, status, json };
}

/**
 * Leftover: showStackTraces || ADK_DEBUG_NEST === "1" requires exact "1"
 * (mirrors ErrorHandlingUtils leftover); near-misses do not enable stack.
 */
describe("PrettyErrorFilter ADK_DEBUG_NEST exact leftover edges", () => {
	const originalDebugNest = process.env.ADK_DEBUG_NEST;

	afterEach(() => {
		if (originalDebugNest === undefined) {
			delete process.env.ADK_DEBUG_NEST;
		} else {
			process.env.ADK_DEBUG_NEST = originalDebugNest;
		}
	});

	it("near-miss ADK_DEBUG_NEST values do not enable stack when ctor is false", () => {
		for (const value of ["true", "01", "1 ", "0"]) {
			process.env.ADK_DEBUG_NEST = value;
			const filter = new PrettyErrorFilter(false);
			const { host, json } = createHost();
			filter.catch(new Error("boom"), host);
			expect(json.mock.calls[0][0].stack).toBeUndefined();
		}
	});

	it('ADK_DEBUG_NEST === "1" enables stack when ctor is false', () => {
		process.env.ADK_DEBUG_NEST = "1";
		const filter = new PrettyErrorFilter(false);
		const { host, json } = createHost();
		filter.catch(new Error("boom"), host);
		expect(json.mock.calls[0][0].stack).toEqual(
			expect.stringContaining("boom"),
		);
	});
});
