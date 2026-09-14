import { describe, expect, it } from "vitest";
import { ActiveStreamingTool } from "../../agents/active-streaming-tool";
import { LiveRequestQueue } from "../../agents/live-request-queue";
import { TranscriptionEntry } from "../../agents/transcription-entry";

/**
 * Eighth leftover: ActiveStreamingTool / TranscriptionEntry assign
 * `options?.task` / `options.role` without coalescing. Explicit undefined
 * and falsy role values stay as provided (vs omitted).
 */
describe("ActiveStreamingTool / TranscriptionEntry falsy options eighth leftover", () => {
	it("explicit undefined task/stream stay undefined (options object present)", () => {
		const tool = new ActiveStreamingTool({
			task: undefined,
			stream: undefined,
		});
		expect(tool.task).toBeUndefined();
		expect(tool.stream).toBeUndefined();
	});

	it("keeps only stream when task is explicitly undefined", () => {
		const stream = new LiveRequestQueue();
		const tool = new ActiveStreamingTool({ task: undefined, stream });
		expect(tool.task).toBeUndefined();
		expect(tool.stream).toBe(stream);
	});

	it.each([
		{ label: '""', role: "" },
		{ label: "0", role: 0 },
		{ label: "false", role: false },
		{ label: "null", role: null },
	])("TranscriptionEntry keeps falsy role $label as-is", ({ role }) => {
		const data = { role: "user", parts: [{ text: "x" }] };
		const entry = new TranscriptionEntry({
			role: role as any,
			data,
		});
		expect(entry.role).toBe(role);
		expect(entry.data).toBe(data);
	});

	it('TranscriptionEntry keeps whitespace role " " (truthy)', () => {
		const data = { data: "YQ==", mimeType: "audio/pcm" };
		const entry = new TranscriptionEntry({ role: " ", data });
		expect(entry.role).toBe(" ");
		expect(entry.data).toBe(data);
	});
});
