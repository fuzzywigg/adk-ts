import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Nineteenth leftover residual deepen (soft after tip #292 / #287):
 * tip auth/memory owns focused `twentieth-leftover-edges` push.yml filter;
 * logger/env residual deepen stays gated via full pnpm test; no steal.
 */
describe("logger/env ci workflow nineteenth residual deepen leftover edges", () => {
	const root = resolve(__dirname, "../../../../..");

	it("ci.yml build-and-test still runs pnpm test and ADK coverage", () => {
		const ci = readFileSync(resolve(root, ".github/workflows/ci.yml"), "utf8");
		expect(ci).toContain("build-and-test:");
		expect(ci).toMatch(/run:\s*pnpm test\b/);
		expect(ci).toContain("pnpm --filter @iqai/adk test:coverage");
		expect(ci).toContain("packages/adk/coverage");
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

	it("ci.yml still pins Node 22 and frozen lockfile", () => {
		const ci = readFileSync(resolve(root, ".github/workflows/ci.yml"), "utf8");
		expect(ci).toMatch(/node-version:\s*22\b/);
		expect(ci).toContain("pnpm install --frozen-lockfile");
	});
});
