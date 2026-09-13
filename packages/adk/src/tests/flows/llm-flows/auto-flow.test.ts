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
});
