import { beforeEach, describe, expect, it, vi } from "vitest";
import { BaseAgent } from "../../agents/base-agent";
import type { InvocationContext } from "../../agents/invocation-context";
import {
	createBranchContextForSubAgent,
	mergeAgentRun,
	ParallelAgent,
} from "../../agents/parallel-agent";
import { Event } from "../../events/event";
import { PluginManager } from "../../plugins/plugin-manager";
import type { BaseSessionService } from "../../sessions/base-session-service";

class MockSubAgent extends BaseAgent {
	runAsync = vi.fn();
	runLive = vi.fn();

	constructor(name: string) {
		super({ name, description: "" });
	}
}

const baseContext: InvocationContext = {
	invocationId: "fifth-par-inv",
	agent: {} as any,
	branch: "",
	session: {
		id: "ses-par-fifth",
		userId: "user-par",
		appName: "app-par",
		state: {},
		events: [],
		lastUpdateTime: 0,
	} as any,
	endInvocation: false,
	sessionService: {} as BaseSessionService,
	pluginManager: new PluginManager(),
	createChildContext: vi.fn(),
} as unknown as InvocationContext;

describe("ParallelAgent fifth leftover — branch falsy reset", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("empty-string parent branch resets nesting (falsy ? arm)", () => {
		const parent = new ParallelAgent({
			name: "par_empty_branch",
			description: "d",
		});
		const child = new MockSubAgent("leaf");
		const ctx = {
			...baseContext,
			branch: "",
			agent: parent,
		} as InvocationContext;
		const branched = createBranchContextForSubAgent(parent, child, ctx);
		expect(branched.branch).toBe("par_empty_branch.leaf");
	});

	it("undefined parent branch resets nesting like empty string", () => {
		const parent = new ParallelAgent({
			name: "par_undef_branch",
			description: "d",
		});
		const child = new MockSubAgent("leaf");
		const ctx = {
			...baseContext,
			branch: undefined as any,
			agent: parent,
		} as InvocationContext;
		const branched = createBranchContextForSubAgent(parent, child, ctx);
		expect(branched.branch).toBe("par_undef_branch.leaf");
	});

	it("whitespace-only parent branch is truthy and nests", () => {
		const parent = new ParallelAgent({
			name: "par_ws_branch",
			description: "d",
		});
		const child = new MockSubAgent("leaf");
		const ctx = {
			...baseContext,
			branch: " ",
			agent: parent,
		} as InvocationContext;
		const branched = createBranchContextForSubAgent(parent, child, ctx);
		expect(branched.branch).toBe(" .par_ws_branch.leaf");
	});

	it("preserves session/services onto branched context", () => {
		const parent = new ParallelAgent({
			name: "par_svc",
			description: "d",
		});
		const child = new MockSubAgent("svc_leaf");
		const branched = createBranchContextForSubAgent(parent, child, baseContext);
		expect(branched.session).toBe(baseContext.session);
		expect(branched.sessionService).toBe(baseContext.sessionService);
		expect(branched.pluginManager).toBe(baseContext.pluginManager);
		expect(branched.invocationId).toBe(baseContext.invocationId);
	});
});

describe("ParallelAgent fifth leftover — mergeAgentRun recovery", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("recovers when the first of three generators errors immediately", async () => {
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		// biome-ignore lint/correctness/useYield: throws before yielding
		async function* bad() {
			throw new Error("first boom");
		}
		async function* mid() {
			yield new Event({ author: "mid" });
		}
		async function* last() {
			yield new Event({ author: "last" });
		}
		const authors: string[] = [];
		for await (const event of mergeAgentRun([bad(), mid(), last()])) {
			authors.push(event.author);
		}
		expect(authors.sort()).toEqual(["last", "mid"]);
		expect(error).toHaveBeenCalled();
		error.mockRestore();
	});

	it("recovers when a later generator errors after emitting", async () => {
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		async function* ok() {
			yield new Event({ author: "ok1" });
			yield new Event({ author: "ok2" });
		}
		async function* thenBad() {
			yield new Event({ author: "pre_fail" });
			throw new Error("late boom");
		}
		const authors: string[] = [];
		for await (const event of mergeAgentRun([ok(), thenBad()])) {
			authors.push(event.author);
		}
		expect(authors).toContain("ok1");
		expect(authors).toContain("ok2");
		expect(authors).toContain("pre_fail");
		expect(error).toHaveBeenCalled();
		error.mockRestore();
	});

	it("survives when every generator errors (empty active set)", async () => {
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		// biome-ignore lint/correctness/useYield: throws before yielding
		async function* a() {
			throw new Error("a");
		}
		// biome-ignore lint/correctness/useYield: throws before yielding
		async function* b() {
			throw new Error("b");
		}
		const events: Event[] = [];
		for await (const event of mergeAgentRun([a(), b()])) {
			events.push(event);
		}
		expect(events).toEqual([]);
		expect(error).toHaveBeenCalledTimes(2);
		error.mockRestore();
	});

	it("single generator that completes without events yields nothing", async () => {
		// biome-ignore lint/correctness/useYield: empty completion path under test
		async function* empty() {
			return;
		}
		const events: Event[] = [];
		for await (const event of mergeAgentRun([empty()])) {
			events.push(event);
		}
		expect(events).toEqual([]);
	});
});
