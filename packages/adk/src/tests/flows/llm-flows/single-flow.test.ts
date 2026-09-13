import { describe, expect, it, vi } from "vitest";
import { SingleFlow } from "@adk/flows";
import { requestProcessor as authRequestProcessor } from "../../../auth/auth-preprocessor";
import {
	requestProcessor as codeExecutionRequestProcessor,
	responseProcessor as codeExecutionResponseProcessor,
} from "../../../flows/llm-flows/code-execution";
import {
	requestProcessor as nlPlanningRequestProcessor,
	responseProcessor as nlPlanningResponseProcessor,
} from "../../../flows/llm-flows/nl-planning";

vi.mock("@adk/logger", () => ({
	Logger: vi.fn(() => ({
		debug: vi.fn(),
		error: vi.fn(),
		warn: vi.fn(),
		info: vi.fn(),
	})),
}));

describe("SingleFlow", () => {
	it("has expected requestProcessors and responseProcessors lengths", () => {
		const flow = new SingleFlow();

		expect(flow.requestProcessors).toHaveLength(8);
		expect(flow.responseProcessors).toHaveLength(3);
	});

	it("processors are defined objects with runAsync", () => {
		const flow = new SingleFlow();

		for (const processor of [
			...flow.requestProcessors,
			...flow.responseProcessors,
		]) {
			expect(processor).toBeDefined();
			expect(typeof processor.runAsync).toBe("function");
		}
	});

	it("wires auth, nl-planning, and code-execution processors", () => {
		const flow = new SingleFlow();

		expect(flow.requestProcessors).toContain(authRequestProcessor);
		expect(flow.requestProcessors).toContain(nlPlanningRequestProcessor);
		expect(flow.requestProcessors).toContain(codeExecutionRequestProcessor);
		expect(flow.responseProcessors).toContain(nlPlanningResponseProcessor);
		expect(flow.responseProcessors).toContain(codeExecutionResponseProcessor);
	});
});
