import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Twentieth leftover (HEAVY tip-relaunch residual complement after providers
 * tip #269 / 03ff90a / merged #259; soft-pin refreshed post #287 tip 1f70668):
 * reversible workflow assertions for the tools/mcp residual Vitest slice
 * (PATH/env/maxTokens/messages/filter/schema). Soft pin only — does not
 * retarget push.yml focused gate (auth/memory #287 pins
 * twentieth-leftover-edges). Vitest stays on 3.x.
 */
describe("tools/mcp residual complement ci workflow twentieth leftover edges", () => {
	const root = resolve(__dirname, "../../../../../..");

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

	it("vitest stays on 3.x (no 4.x bump in this residual)", () => {
		const pkg = JSON.parse(
			readFileSync(resolve(root, "packages/adk/package.json"), "utf8"),
		);
		expect(pkg.devDependencies.vitest).toMatch(/^\^?3\./);
	});
});
