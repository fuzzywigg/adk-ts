import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Nineteenth leftover residual deepen after tip #289 / f93c037:
 * soft reversible workflow pins — auth/memory twentieth still owns focused
 * `twentieth-leftover-edges` push.yml filter; logger/env posinf/nan/object-true
 * residual deepen stays gated via full pnpm test. No workflow retarget.
 */
describe("logger/env ci workflow posinf/nan/object-true nineteenth residual deepen", () => {
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

	it("ci.yml still pins Node 22 and frozen lockfile", () => {
		const ci = readFileSync(resolve(root, ".github/workflows/ci.yml"), "utf8");
		expect(ci).toMatch(/node-version:\s*22\b/);
		expect(ci).toContain("pnpm install --frozen-lockfile");
	});
});
