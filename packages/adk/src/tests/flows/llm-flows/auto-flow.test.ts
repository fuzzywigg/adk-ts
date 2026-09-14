import { describe, expect, it, vi } from "vitest";
import { AutoFlow, SingleFlow } from "@adk/flows";
import { requestProcessor as agentTransferRequestProcessor } from "../../../flows/llm-flows/agent-transfer";

vi.mock("@adk/logger", () => ({
	Logger: vi.fn(() => ({
		debug: vi.fn(),
		error: vi.fn(),
		warn: vi.fn(),
		info: vi.fn(),
	})),
}));

describe("AutoFlow", () => {
	it("has one more request processor than SingleFlow", () => {
		const single = new SingleFlow();
		const auto = new AutoFlow();

		expect(auto.requestProcessors.length).toBe(
			single.requestProcessors.length + 1,
		);
		expect(auto.responseProcessors.length).toBe(
			single.responseProcessors.length,
		);
	});

	it("last request processor is agent transfer", () => {
		const single = new SingleFlow();
		const auto = new AutoFlow();

		expect(auto.requestProcessors).toHaveLength(
			single.requestProcessors.length + 1,
		);
		expect(auto.requestProcessors[auto.requestProcessors.length - 1]).toBe(
			agentTransferRequestProcessor,
		);
	});

	it("preserves SingleFlow processor prefix order before agent transfer", () => {
		const single = new SingleFlow();
		const auto = new AutoFlow();
		expect(auto.requestProcessors.slice(0, -1)).toEqual(
			single.requestProcessors,
		);
		expect(auto.responseProcessors).toEqual(single.responseProcessors);
	});

	it("creates independent processor arrays per instance", () => {
		const a = new AutoFlow();
		const b = new AutoFlow();
		expect(a.requestProcessors).not.toBe(b.requestProcessors);
		expect(a.requestProcessors).toHaveLength(b.requestProcessors.length);
		expect(a.requestProcessors.at(-1)).toBe(agentTransferRequestProcessor);
		expect(b.requestProcessors.at(-1)).toBe(agentTransferRequestProcessor);
	});

	it("extends SingleFlow and keeps response processors identical", () => {
		const auto = new AutoFlow();
		const single = new SingleFlow();
		expect(auto).toBeInstanceOf(SingleFlow);
		expect(auto.responseProcessors).toEqual(single.responseProcessors);
		expect(auto.requestProcessors.length).toBeGreaterThan(
			single.requestProcessors.length,
		);
	});

	it("agent transfer is appended exactly once", () => {
		const auto = new AutoFlow();
		const transferCount = auto.requestProcessors.filter(
			(p) => p === agentTransferRequestProcessor,
		).length;
		expect(transferCount).toBe(1);
	});
});
