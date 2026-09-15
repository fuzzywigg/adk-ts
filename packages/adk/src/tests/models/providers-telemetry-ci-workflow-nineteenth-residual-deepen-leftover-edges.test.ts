import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Nineteenth leftover residual deepen (complements #269 / open tools #278):
 * soft reversible workflow pins — auth/memory twentieth owns focused
 * push.yml filter; providers/telemetry residual deepen stays gated via full
 * pnpm test. Vitest remains on 3.x (no 4.x bump).
 */
describe("providers/telemetry ci workflow nineteenth residual deepen leftover edges", () => {
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

	it("root packageManager keeps vitest on 3.x (no accidental 4.x bump)", () => {
		const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
		const lock = readFileSync(resolve(root, "pnpm-lock.yaml"), "utf8");
		expect(pkg.packageManager).toMatch(/^pnpm@/);
		expect(lock).toMatch(/vitest@3\./);
		expect(lock).not.toMatch(/vitest@4\./);
	});
});
