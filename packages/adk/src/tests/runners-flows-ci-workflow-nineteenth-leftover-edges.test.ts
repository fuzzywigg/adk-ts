import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Nineteenth leftover CI gate: push.yml must run the runners/flows residual
 * nineteenth leftover vitest slice (not a prior generation filter).
 */
describe("runners/flows residual nineteenth leftover CI workflow", () => {
	it("push.yml Checkout job runs nineteenth-leftover-edges vitest gate", () => {
		const workflow = readFileSync(
			resolve(__dirname, "../../../../.github/workflows/push.yml"),
			"utf8",
		);
		expect(workflow).toMatch(/nineteenth-leftover-edges/);
		expect(workflow).toMatch(/runners\/flows residual nineteenth leftover/);
	});
});
