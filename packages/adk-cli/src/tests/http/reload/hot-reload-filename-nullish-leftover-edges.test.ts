import { describe, expect, it, vi } from "vitest";
import { HotReloadService } from "../../../http/reload/hot-reload.service";

/**
 * Leftover: filename ?? null — omitted/undefined become null; "" is kept.
 */
describe("HotReloadService filename ?? nullish leftover edges", () => {
	function addClient(service: HotReloadService) {
		const writes: string[] = [];
		const res = {
			writes,
			write: vi.fn((chunk: string) => {
				writes.push(chunk);
				return true;
			}),
			end: vi.fn(),
			on: vi.fn(),
		};
		service.addClient(res);
		return res;
	}

	it("omitted filename becomes null via ??", () => {
		const service = new HotReloadService();
		const res = addClient(service);
		service.broadcastReload();
		const payload = res.writes.find((w) => w.includes('"type":"reload"'));
		expect(payload).toContain('"filename":null');
		service.closeAll();
	});

	it("empty-string filename is preserved (not nullish)", () => {
		const service = new HotReloadService();
		const res = addClient(service);
		service.broadcastReload("");
		const payload = res.writes.find((w) => w.includes('"type":"reload"'));
		expect(payload).toContain('"filename":""');
		service.closeAll();
	});
});
