import { describe, expect, it } from "vitest";
import { requestProcessor as authRequestProcessor } from "../../../auth/auth-preprocessor";
import {
	basicRequestProcessor,
	codeExecutionRequestProcessor,
	codeExecutionResponseProcessor,
	contentRequestProcessor,
	identityRequestProcessor,
	instructionsRequestProcessor,
	nlPlanningRequestProcessor,
	nlPlanningResponseProcessor,
	SingleFlow,
} from "../../../flows/llm-flows";
import { responseProcessor as outputSchemaResponseProcessor } from "../../../flows/llm-flows/output-schema";
import { sharedMemoryRequestProcessor } from "../../../flows/llm-flows/shared-memory";

describe("SingleFlow", () => {
	it("registers the expected request and response processors", () => {
		const flow = new SingleFlow();

		expect(flow.requestProcessors).toHaveLength(8);
		expect(flow.requestProcessors[0]).toBe(basicRequestProcessor);
		expect(flow.requestProcessors[1]).toBe(authRequestProcessor);
		expect(flow.requestProcessors[2]).toBe(instructionsRequestProcessor);
		expect(flow.requestProcessors[3]).toBe(identityRequestProcessor);
		expect(flow.requestProcessors[4]).toBe(contentRequestProcessor);
		expect(flow.requestProcessors[5]).toBe(sharedMemoryRequestProcessor);
		expect(flow.requestProcessors[6]).toBe(nlPlanningRequestProcessor);
		expect(flow.requestProcessors[7]).toBe(codeExecutionRequestProcessor);

		expect(flow.responseProcessors).toHaveLength(3);
		expect(flow.responseProcessors[0]).toBe(nlPlanningResponseProcessor);
		expect(flow.responseProcessors[1]).toBe(outputSchemaResponseProcessor);
		expect(flow.responseProcessors[2]).toBe(codeExecutionResponseProcessor);
	});

	it("creates independent processor arrays per instance", () => {
		const a = new SingleFlow();
		const b = new SingleFlow();

		expect(a.requestProcessors).not.toBe(b.requestProcessors);
		expect(a.responseProcessors).not.toBe(b.responseProcessors);
		expect(a.requestProcessors).toEqual(b.requestProcessors);
		expect(a.responseProcessors).toEqual(b.responseProcessors);
	});

	it("keeps request processors ahead of code execution and planning last among shared ones", () => {
		const flow = new SingleFlow();
		const requestNames = flow.requestProcessors.map((p) => p.constructor.name);
		expect(requestNames.indexOf(basicRequestProcessor.constructor.name)).toBe(
			0,
		);
		expect(
			requestNames.indexOf(codeExecutionRequestProcessor.constructor.name),
		).toBe(requestNames.length - 1);
		expect(
			requestNames.indexOf(nlPlanningRequestProcessor.constructor.name),
		).toBeLessThan(
			requestNames.indexOf(codeExecutionRequestProcessor.constructor.name),
		);
	});
});
