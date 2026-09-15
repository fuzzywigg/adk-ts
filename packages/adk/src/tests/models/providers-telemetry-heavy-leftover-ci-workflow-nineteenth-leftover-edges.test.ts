import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Nineteenth leftover (HEAVY tip-relaunch residual after tip #260 / #261):
 * soft reversible workflow pin for the providers/telemetry boolean-true /
 * string-true / -0 residual that closed #252 never landed and open #269's
 * NaN/posinf slice does not cover. Tip auth/memory owns the focused
 * `nineteenth-leftover-edges` filter — this slice only asserts that gate
 * stays wired plus lint/build/test.
 */
describe("providers/telemetry heavy leftover ci workflow nineteenth leftover edges", () => {
	const root = resolve(__dirname, "../../../../..");

	it("ci.yml build-and-test still runs pnpm test and ADK coverage", () => {
		const ci = readFileSync(resolve(root, ".github/workflows/ci.yml"), "utf8");
		expect(ci).toContain("build-and-test:");
		expect(ci).toMatch(/run:\s*pnpm test\b/);
		expect(ci).toContain("pnpm --filter @iqai/adk test:coverage");
		expect(ci).toContain("packages/adk/coverage");
		expect(ci).toContain("continue-on-error: true");
	});

	it("push.yml runs focused nineteenth leftover slice then pnpm test", () => {
		const push = readFileSync(
			resolve(root, ".github/workflows/push.yml"),
			"utf8",
		);
		expect(push).toContain("branches-ignore:");
		expect(push).toContain("- main");
		expect(push).toMatch(/run:\s*pnpm lint\b/);
		expect(push).toContain("pnpm --filter @iqai/adk build");
		expect(push).toContain("nineteenth-leftover-edges");
		expect(push).toMatch(/run:\s*pnpm test\b/);
	});

	it("ci.yml concurrency still cancels in-progress runs on the same ref", () => {
		const ci = readFileSync(resolve(root, ".github/workflows/ci.yml"), "utf8");
		expect(ci).toContain("cancel-in-progress: true");
		expect(ci).toMatch(
			/group:\s*ci-\$\{\{\s*github\.workflow\s*\}\}-\$\{\{\s*github\.ref\s*\}\}/,
		);
	});
});
