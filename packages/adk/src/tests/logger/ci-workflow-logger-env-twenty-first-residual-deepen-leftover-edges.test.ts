import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Twenty-first leftover residual deepen (soft after tip #292 / 5156762):
 * tip auth/memory owns focused `twentieth-leftover-edges` push.yml filter;
 * logger/env twenty-first residual deepen stays gated via full pnpm test.
 * Soften sibling nineteenth residual soft-pins left stale after #292.
 */
describe("logger/env ci workflow twenty-first residual deepen leftover edges", () => {
	const root = resolve(__dirname, "../../../../..");

	it("ci.yml build-and-test still runs pnpm test and ADK coverage", () => {
		const ci = readFileSync(resolve(root, ".github/workflows/ci.yml"), "utf8");
		expect(ci).toContain("build-and-test:");
		expect(ci).toMatch(/run:\s*pnpm test\b/);
		expect(ci).toContain("pnpm --filter @iqai/adk test:coverage");
		expect(ci).toContain("packages/adk/coverage");
		expect(ci).toContain("continue-on-error: true");
	});

	it("push.yml still runs Biome lint, ADK build, and pnpm test", () => {
		const push = readFileSync(
			resolve(root, ".github/workflows/push.yml"),
			"utf8",
		);
		expect(push).toContain("branches-ignore:");
		expect(push).toContain("- main");
		expect(push).toMatch(/run:\s*pnpm lint\b/);
		expect(push).toContain("pnpm --filter @iqai/adk build");
		expect(push).toMatch(/run:\s*pnpm test\b/);
	});

	it("push.yml focused gate still pins twentieth leftover edges (auth/memory tip)", () => {
		const push = readFileSync(
			resolve(root, ".github/workflows/push.yml"),
			"utf8",
		);
		expect(push).toContain("twentieth-leftover-edges");
		expect(push).toContain("auth/memory twentieth leftover slice");
	});

	it("ci.yml concurrency still cancels in-progress runs on the same ref", () => {
		const ci = readFileSync(resolve(root, ".github/workflows/ci.yml"), "utf8");
		expect(ci).toContain("cancel-in-progress: true");
		expect(ci).toMatch(
			/group:\s*ci-\$\{\{\s*github\.workflow\s*\}\}-\$\{\{\s*github\.ref\s*\}\}/,
		);
	});

	it("packageManager still pins pnpm 9 and engines node >=22", () => {
		const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
		expect(pkg.packageManager).toMatch(/^pnpm@9\./);
		expect(pkg.engines?.node).toMatch(/>=\s*22/);
	});

	it("root packageManager keeps vitest on 3.x (no accidental 4.x bump)", () => {
		const lock = readFileSync(resolve(root, "pnpm-lock.yaml"), "utf8");
		expect(lock).toMatch(/vitest@3\./);
		expect(lock).not.toMatch(/vitest@4\./);
	});
});
