import { describe, expect, it } from "vitest";
import * as flows from "../../../flows/llm-flows";
import * as flowsBarrel from "../../../flows";

describe("llm-flows barrel exports", () => {
	it("re-exports core flow classes and processors from llm-flows index", () => {
		expect(flows.BaseLlmFlow).toBeTypeOf("function");
		expect(flows.SingleFlow).toBeTypeOf("function");
		expect(flows.AutoFlow).toBeTypeOf("function");
		expect(flows.BaseLlmRequestProcessor).toBeTypeOf("function");
		expect(flows.BaseLlmResponseProcessor).toBeTypeOf("function");
		expect(flows.basicRequestProcessor).toBeTruthy();
		expect(flows.identityRequestProcessor).toBeTruthy();
		expect(flows.instructionsRequestProcessor).toBeTruthy();
		expect(flows.contentRequestProcessor).toBeTruthy();
		expect(flows.agentTransferRequestProcessor).toBeTruthy();
		expect(flows.nlPlanningRequestProcessor).toBeTruthy();
		expect(flows.nlPlanningResponseProcessor).toBeTruthy();
		expect(flows.codeExecutionRequestProcessor).toBeTruthy();
		expect(flows.codeExecutionResponseProcessor).toBeTruthy();
		expect(flows.handleFunctionCallsAsync).toBeTypeOf("function");
		expect(flows.handleFunctionCallsLive).toBeTypeOf("function");
		expect(flows.generateClientFunctionCallId).toBeTypeOf("function");
		expect(flows.AF_FUNCTION_CALL_ID_PREFIX).toBe("adk-");
		expect(flows.REQUEST_EUC_FUNCTION_CALL_NAME).toBe("adk_request_credential");
	});

	it("re-exports flow classes from the parent flows barrel", () => {
		expect(flowsBarrel.BaseLlmFlow).toBe(flows.BaseLlmFlow);
		expect(flowsBarrel.SingleFlow).toBe(flows.SingleFlow);
		expect(flowsBarrel.AutoFlow).toBe(flows.AutoFlow);
	});

	it("instantiates SingleFlow and AutoFlow from barrel exports", () => {
		const single = new flows.SingleFlow();
		const auto = new flows.AutoFlow();
		expect(single.requestProcessors.length).toBe(8);
		expect(auto.requestProcessors.length).toBe(9);
		expect(auto.requestProcessors.at(-1)).toBe(
			flows.agentTransferRequestProcessor,
		);
	});

	it("exposes processor instances with runAsync methods", () => {
		expect(typeof flows.basicRequestProcessor.runAsync).toBe("function");
		expect(typeof flows.identityRequestProcessor.runAsync).toBe("function");
		expect(typeof flows.instructionsRequestProcessor.runAsync).toBe("function");
		expect(typeof flows.nlPlanningRequestProcessor.runAsync).toBe("function");
		expect(typeof flows.nlPlanningResponseProcessor.runAsync).toBe("function");
		expect(typeof flows.agentTransferRequestProcessor.runAsync).toBe(
			"function",
		);
	});
});
