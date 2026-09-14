import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Fifteenth leftover: reversible workflow assertions for the providers /
 * telemetry Vitest slice. Softened to fourteenth-style lint/build/test pins so
 * later TOKENMAXX slices can retarget the focused leftover gate without
 * breaking this residual.
 */
describe("providers/telemetry ci workflow fifteenth leftover edges", () => {
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
});
