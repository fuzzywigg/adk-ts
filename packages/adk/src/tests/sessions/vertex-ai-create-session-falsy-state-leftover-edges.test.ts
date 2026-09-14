import { afterEach, describe, expect, it, vi } from "vitest";
import { VertexAiSessionService } from "../../sessions/vertex-ai-session-service";

function createService(
	options: ConstructorParameters<typeof VertexAiSessionService>[0] = {
		agentEngineId: "9",
	},
) {
	const asyncRequest = vi.fn();
	const service = new VertexAiSessionService(options);
	(service as any).getApiClient = () => ({ async_request: asyncRequest });
	return { service, asyncRequest };
}

/**
 * Leftover: createSession `if (state)` omits session_state for falsy values;
 * {} still sends.
 */
describe("vertex-ai createSession falsy-state leftover edges", () => {
	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	function mockCreateSuccess(asyncRequest: ReturnType<typeof vi.fn>) {
		asyncRequest
			.mockResolvedValueOnce({
				name: "projects/p/locations/l/reasoningEngines/9/sessions/s1/operations/op1",
			})
			.mockResolvedValueOnce({ done: true })
			.mockResolvedValueOnce({
				name: "projects/p/locations/l/reasoningEngines/9/sessions/s1",
				updateTime: "2024-01-01T00:00:00.000Z",
				sessionState: {},
			});
	}

	it.each([
		{ label: "undefined omitted arg", state: undefined },
		{ label: "null", state: null },
		{ label: "false", state: false },
		{ label: "0", state: 0 },
		{ label: "empty string", state: "" },
	])("omits session_state for falsy state ($label)", async ({ state }) => {
		vi.spyOn(console, "debug").mockImplementation(() => undefined);
		const { service, asyncRequest } = createService();
		mockCreateSuccess(asyncRequest);
		await service.createSession("app", "u", state as any);
		expect(asyncRequest.mock.calls[0][0].request_dict).toEqual({
			user_id: "u",
		});
		expect(asyncRequest.mock.calls[0][0].request_dict).not.toHaveProperty(
			"session_state",
		);
	});

	it("includes session_state for empty object {}", async () => {
		vi.spyOn(console, "debug").mockImplementation(() => undefined);
		const { service, asyncRequest } = createService();
		mockCreateSuccess(asyncRequest);
		await service.createSession("app", "u", {});
		expect(asyncRequest.mock.calls[0][0].request_dict).toEqual({
			user_id: "u",
			session_state: {},
		});
	});

	it("includes populated session_state", async () => {
		vi.spyOn(console, "debug").mockImplementation(() => undefined);
		const { service, asyncRequest } = createService();
		mockCreateSuccess(asyncRequest);
		await service.createSession("app", "u", { a: 1 });
		expect(asyncRequest.mock.calls[0][0].request_dict).toEqual({
			user_id: "u",
			session_state: { a: 1 },
		});
	});
});
