import { describe, expect, it } from "vitest";
import { ActiveStreamingTool } from "../../agents/active-streaming-tool";
import { LiveRequestQueue } from "../../agents/live-request-queue";

describe("ActiveStreamingTool", () => {
	it("defaults task and stream to undefined", () => {
		const tool = new ActiveStreamingTool();

		expect(tool.task).toBeUndefined();
		expect(tool.stream).toBeUndefined();
	});

	it("stores provided task and stream", () => {
		const task = Promise.resolve("done");
		const stream = new LiveRequestQueue();
		const tool = new ActiveStreamingTool({ task, stream });

		expect(tool.task).toBe(task);
		expect(tool.stream).toBe(stream);
	});
});
