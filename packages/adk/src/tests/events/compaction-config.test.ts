import { describe, expect, it } from "vitest";
import type { EventsCompactionConfig } from "../../events/compaction-config";

describe("EventsCompactionConfig", () => {
	it("accepts required compaction fields with defaults-style values", () => {
		const config: EventsCompactionConfig = {
			compactionInterval: 10,
			overlapSize: 2,
		};

		expect(config.compactionInterval).toBe(10);
		expect(config.overlapSize).toBe(2);
		expect(config.summarizer).toBeUndefined();
	});

	it("allows attaching a summarizer implementation", async () => {
		const summarizer = {
			maybeSummarizeEvents: async () => undefined,
		};
		const config: EventsCompactionConfig = {
			summarizer,
			compactionInterval: 5,
			overlapSize: 1,
		};

		expect(config.summarizer).toBe(summarizer);
		expect(await config.summarizer?.maybeSummarizeEvents([])).toBeUndefined();
	});
});
