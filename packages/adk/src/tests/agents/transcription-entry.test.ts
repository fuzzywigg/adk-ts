import { describe, expect, it } from "vitest";
import { TranscriptionEntry } from "../../agents/transcription-entry";

describe("TranscriptionEntry", () => {
	it("stores role and content data", () => {
		const data = { role: "user", parts: [{ text: "hello" }] };
		const entry = new TranscriptionEntry({
			role: "user",
			data,
		});

		expect(entry.role).toBe("user");
		expect(entry.data).toEqual(data);
	});

	it("allows role to be omitted", () => {
		const data = { data: "YQ==", mimeType: "audio/pcm" };
		const entry = new TranscriptionEntry({ data });

		expect(entry.role).toBeUndefined();
		expect(entry.data).toEqual(data);
	});
});
