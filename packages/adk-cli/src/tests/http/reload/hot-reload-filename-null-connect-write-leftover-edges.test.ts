import { afterEach, describe, expect, it, vi } from "vitest";
import { HotReloadService } from "../../../http/reload/hot-reload.service";

function createFakeResponse() {
	const writes: string[] = [];
	const listeners = new Map<string, Array<(...args: unknown[]) => void>>();
	const res = {
		writes,
		write: vi.fn((chunk: string) => {
			writes.push(chunk);
			return true;
		}),
		end: vi.fn(),
		on: vi.fn((event: string, listener: (...args: unknown[]) => void) => {
			const list = listeners.get(event) || [];
			list.push(listener);
			listeners.set(event, list);
			return res;
		}),
		emit(event: string) {
			for (const listener of listeners.get(event) || []) {
				listener();
			}
		},
	};
	return res;
}

describe("HotReloadService filename null / connect-write leftover edges", () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it("coalesces undefined filename to null via ?? in broadcastReload", () => {
		const service = new HotReloadService();
		const res = createFakeResponse();
		service.addClient(res);

		service.broadcastReload(undefined);

		const payload = res.writes.find((w) => w.includes('"type":"reload"'));
		expect(payload).toContain('"filename":null');
		service.closeAll();
	});

	it("ignores initial connected write failures and still registers the client", () => {
		const service = new HotReloadService();
		const res = createFakeResponse();
		res.write.mockImplementationOnce(() => {
			throw new Error("write failed");
		});

		expect(() => service.addClient(res)).not.toThrow();
		service.broadcastState("a", "s");
		expect(res.writes.some((w) => w.includes('"type":"state"'))).toBe(true);
		service.closeAll();
	});

	it("removes client when keepalive ping write throws", () => {
		vi.useFakeTimers();
		const service = new HotReloadService();
		const res = createFakeResponse();
		service.addClient(res);

		res.write.mockImplementation((chunk: string) => {
			if (chunk.startsWith(": ping")) {
				throw new Error("ping fail");
			}
			res.writes.push(chunk);
			return true;
		});

		vi.advanceTimersByTime(25000);
		expect(res.end).toHaveBeenCalled();
		service.closeAll();
	});

	it("removeClient is a no-op when the response was never registered", () => {
		const service = new HotReloadService();
		const res = createFakeResponse();
		expect(() => service.removeClient(res)).not.toThrow();
		expect(res.end).not.toHaveBeenCalled();
	});

	it("removeClient ignores end() failures for registered clients", () => {
		const service = new HotReloadService();
		const res = createFakeResponse();
		service.addClient(res);
		res.end.mockImplementation(() => {
			throw new Error("already closed");
		});
		expect(() => service.removeClient(res)).not.toThrow();
	});
});
