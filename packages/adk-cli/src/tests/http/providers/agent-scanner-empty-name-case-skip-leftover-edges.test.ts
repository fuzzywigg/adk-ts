import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentScanner } from "../../../http/providers/agent-scanner.service";

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

/**
 * Leftover: empty quoted name falls back; name "0" kept; Agent.ts not scanned;
 * Node_Modules case-sensitive skip; agentsDir "" uses cwd.
 */
describe("AgentScanner empty name / case skip leftover edges", () => {
	const dirs: string[] = [];

	afterEach(() => {
		for (const dir of dirs.splice(0)) {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	function makeProject(): string {
		const root = mkdtempSync(join(tmpdir(), "adk-scanner-leftover-"));
		dirs.push(root);
		writeFileSync(join(root, "package.json"), JSON.stringify({ name: "demo" }));
		return root;
	}

	it("empty quoted name falls back to directory name", () => {
		const root = makeProject();
		const agentDir = join(root, "agents", "blank");
		mkdirSync(agentDir, { recursive: true });
		writeFileSync(
			join(agentDir, "agent.ts"),
			`export const agent = { name: "", runAsync() {} };`,
		);

		const scanner = new AgentScanner(true);
		const agents = scanner.scanAgents(root, new Map());
		expect(agents.get("agents/blank")?.name).toBe("blank");
	});

	it("keeps name '0' (truthy string)", () => {
		const root = makeProject();
		const agentDir = join(root, "agents", "zero");
		mkdirSync(agentDir, { recursive: true });
		writeFileSync(
			join(agentDir, "agent.ts"),
			`export const agent = { name: "0", runAsync() {} };`,
		);

		const scanner = new AgentScanner(true);
		const agents = scanner.scanAgents(root, new Map());
		expect(agents.get("agents/zero")?.name).toBe("0");
	});

	it("does not scan Agent.ts / AGENT.TS (exact AGENT_FILENAMES)", () => {
		const root = makeProject();
		const agentDir = join(root, "agents", "cased");
		mkdirSync(agentDir, { recursive: true });
		writeFileSync(
			join(agentDir, "Agent.ts"),
			`export const agent = { name: "wrong_case" };`,
		);
		writeFileSync(
			join(agentDir, "AGENT.TS"),
			`export const agent = { name: "upper" };`,
		);

		const scanner = new AgentScanner(true);
		const agents = scanner.scanAgents(root, new Map());
		expect(agents.has("agents/cased")).toBe(false);
	});

	it("scans Node_Modules (skip list is case-sensitive)", () => {
		const root = makeProject();
		const nested = join(root, "Node_Modules", "pkg");
		mkdirSync(nested, { recursive: true });
		writeFileSync(
			join(nested, "agent.ts"),
			`export const agent = { name: "cased_nm" };`,
		);

		const scanner = new AgentScanner(true);
		const agents = scanner.scanAgents(root, new Map());
		expect(agents.get("Node_Modules/pkg")?.name).toBe("cased_nm");
	});

	it("empty agentsDir uses process.cwd()", () => {
		const scanner = new AgentScanner(true);
		const agents = scanner.scanAgents("", new Map());
		expect(agents).toBeInstanceOf(Map);
	});

	it("loaded agent empty name falls through to file extract", () => {
		const root = makeProject();
		const agentDir = join(root, "agents", "fall");
		mkdirSync(agentDir, { recursive: true });
		writeFileSync(
			join(agentDir, "agent.ts"),
			`export const agent = { name: "from_file" };`,
		);

		const scanner = new AgentScanner(true);
		const loaded = new Map([
			["agents/fall", { agent: { name: "" }, sessionId: "s1" }],
		]);
		const agents = scanner.scanAgents(root, loaded as never);
		expect(agents.get("agents/fall")?.name).toBe("from_file");
	});
});
