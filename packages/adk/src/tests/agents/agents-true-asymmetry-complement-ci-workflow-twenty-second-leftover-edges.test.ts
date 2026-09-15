import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Twenty-second leftover (HEAVY tip-relaunch residual complement after tip
 * #254 / open #265): reversible workflow assertions for the agents
 * number-one / empty-object / NaN complement Vitest slice. Softened while
 * open #265 owns the focused twenty-second filter pin — pins lint/build/test
 * only (no push.yml retarget; avoids conflicting with #265). Auth/memory
 * nineteenth currently owns main's pin until #265 merges.
 */
describe("agents true-asymmetry residual complement ci workflow twenty-second leftover edges", () => {
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
