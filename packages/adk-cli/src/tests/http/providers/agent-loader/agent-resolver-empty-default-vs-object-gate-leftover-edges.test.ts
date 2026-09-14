import { Logger } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { AgentResolver } from "../../../../http/providers/agent-loader/agent-resolver";
import { resolveAgentExport } from "../../../../http/providers/agent-loader/resolver";
import { TypeGuards } from "../../../../http/providers/agent-loader/type-guards";

function fakeAgent(name = "demo") {
	return {
		name,
		runAsync: async function* () {},
	};
}

/**
 * Leftover asymmetry: AgentResolver uses ?? so default:"" becomes candidate;
 * resolver.ts gates default with && typeof === "object". AgentResolver only
 * matches factory keys (not fn.name).
 */
describe("AgentResolver empty default vs object-gate leftover edges", () => {
	const resolver = new AgentResolver(
		new Logger("AgentResolverLeftover"),
		true,
		new TypeGuards(),
	);

	it("AgentResolver: default '' is kept by ?? then fails as primitive", async () => {
		await expect(resolver.resolveAgentExport({ default: "" })).rejects.toThrow(
			"No agent export resolved",
		);
	});

	it("resolver.ts: default '' skipped by object gate; named agent still found", async () => {
		const agent = fakeAgent("named");
		const result = await resolveAgentExport({
			default: "" as never,
			agent,
		});
		expect(result.agent).toBe(agent);
	});

	it("AgentResolver ignores helper named createAgent (key-only regex)", async () => {
		const agent = fakeAgent("fn-only");
		function createAgent() {
			return agent;
		}
		await expect(
			resolver.resolveAgentExport({ helper: createAgent }),
		).rejects.toThrow("No agent export resolved");
	});

	it("resolver.ts resolves the same helper via fn.name", async () => {
		const agent = fakeAgent("fn-only");
		function createAgent() {
			return agent;
		}
		const result = await resolveAgentExport({ helper: createAgent });
		expect(result.agent).toBe(agent);
	});
});
