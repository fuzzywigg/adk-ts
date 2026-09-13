import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	AgentScanner,
	DIRECTORIES_TO_SKIP,
} from "../../../http/providers/agent-scanner.service";

vi.mock("@nestjs/common", async () => {
	const actual =
		await vi.importActual<typeof import("@nestjs/common")>("@nestjs/common");
	return {
		...actual,
		Logger: class {
			log = vi.fn();
			warn = vi.fn();
			error = vi.fn();
			debug = vi.fn();
		},
	};
});

describe("DIRECTORIES_TO_SKIP", () => {
	it("includes common build and dependency directories", () => {
		expect(DIRECTORIES_TO_SKIP).toContain("node_modules");
		expect(DIRECTORIES_TO_SKIP).toContain(".adk-cache");
		expect(DIRECTORIES_TO_SKIP).toContain("dist");
	});
});

describe("AgentScanner", () => {
	const dirs: string[] = [];

	afterEach(() => {
		for (const dir of dirs.splice(0)) {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	function makeProject(): string {
		const root = mkdtempSync(join(tmpdir(), "adk-scanner-"));
		dirs.push(root);
		writeFileSync(join(root, "package.json"), JSON.stringify({ name: "demo" }));
		return root;
	}

	it("finds nested agent.ts files and extracts names", () => {
		const root = makeProject();
		const agentDir = join(root, "agents", "travel");
		mkdirSync(agentDir, { recursive: true });
		writeFileSync(
			join(agentDir, "agent.ts"),
			`export const agent = { name: "travel_bot", runAsync() {} };`,
		);
		mkdirSync(join(root, "node_modules", "pkg"), { recursive: true });
		writeFileSync(
			join(root, "node_modules", "pkg", "agent.ts"),
			`export const agent = { name: "ignored" };`,
		);

		const scanner = new AgentScanner(true);
		const agents = scanner.scanAgents(root, new Map());

		expect(agents.size).toBe(1);
		const agent = agents.get("agents/travel");
		expect(agent?.name).toBe("travel_bot");
		expect(agent?.projectRoot).toBe(root);
		expect(agent?.absolutePath).toContain("travel");
	});

	it("prefers loaded agent names over file extraction", () => {
		const root = makeProject();
		const agentDir = join(root, "agents", "support");
		mkdirSync(agentDir, { recursive: true });
		writeFileSync(
			join(agentDir, "agent.js"),
			`export const agent = { name: "file_name" };`,
		);

		const scanner = new AgentScanner(true);
		const loaded = new Map([
			[
				"agents/support",
				{
					agent: { name: "loaded_support" } as any,
					sessionId: "s1",
				},
			],
		]);
		const agents = scanner.scanAgents(root, loaded as any);

		expect(agents.get("agents/support")?.name).toBe("loaded_support");
		expect(agents.get("agents/support")?.instance?.name).toBe("loaded_support");
	});

	it("falls back to cwd when agentsDir is missing", () => {
		const scanner = new AgentScanner(true);
		const agents = scanner.scanAgents("/path/does/not/exist", new Map());
		expect(agents).toBeInstanceOf(Map);
	});

	it("uses directory name when agent file has no name and skips ignored dirs", () => {
		const root = makeProject();
		writeFileSync(
			join(root, "agent.ts"),
			"export const agent = { runAsync() {} };",
		);
		for (const skip of [".git", ".next", "coverage"]) {
			const skipDir = join(root, skip, "nested");
			mkdirSync(skipDir, { recursive: true });
			writeFileSync(
				join(skipDir, "agent.ts"),
				`export const agent = { name: "ignored_${skip}" };`,
			);
		}

		const scanner = new AgentScanner(true);
		const agents = scanner.scanAgents(root, new Map());
		expect(
			[...agents.values()].some((a) => a.name.startsWith("ignored_")),
		).toBe(false);
		const rootDirName = root.split(/[/\\]/).pop() as string;
		expect(agents.get(rootDirName)?.name).toBe(rootDirName);
	});

	it("quiet mode still discovers agents without throwing", () => {
		const root = makeProject();
		const agentDir = join(root, "agents", "quiet");
		mkdirSync(agentDir, { recursive: true });
		writeFileSync(
			join(agentDir, "agent.js"),
			`export const agent = { name: "quiet_bot" };`,
		);

		const scanner = new AgentScanner(true);
		const agents = scanner.scanAgents(root, new Map());
		expect(agents.get("agents/quiet")?.name).toBe("quiet_bot");
	});
});
