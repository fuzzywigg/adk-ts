import { describe, expect, it } from "vitest";
import { InMemoryArtifactService } from "../../artifacts/in-memory-artifact-service";

/**
 * Leftover distinct from GCS #168: InMemory uses case-sensitive startsWith("user:").
 * User:/USER:/uSer: store under session path, not the user/ namespace.
 */
describe("InMemoryArtifactService sixth leftover: user: namespace case sensitivity", () => {
	const base = {
		appName: "app",
		userId: "uid",
		sessionId: "sess-1",
	};

	const caseVariants = ["User:notes.txt", "USER:notes.txt", "uSer:notes.txt"];

	for (const filename of caseVariants) {
		it(`${filename} does not use user/ namespace path`, async () => {
			const service = new InMemoryArtifactService();
			await service.saveArtifact({
				...base,
				filename,
				artifact: { text: "cased" },
			});
			const paths = [...(service as any).artifacts.keys()] as string[];
			expect(paths).toEqual([`app/uid/sess-1/${filename}`]);
			expect(paths.some((p) => p.includes("/user/"))).toBe(false);
		});
	}

	it("lowercase user: uses user/ namespace", async () => {
		const service = new InMemoryArtifactService();
		await service.saveArtifact({
			...base,
			filename: "user:notes.txt",
			artifact: { text: "ok" },
		});
		const paths = [...(service as any).artifacts.keys()] as string[];
		expect(paths).toEqual(["app/uid/user/user:notes.txt"]);
	});

	it("User: save is invisible when loading via user: name", async () => {
		const service = new InMemoryArtifactService();
		await service.saveArtifact({
			...base,
			filename: "User:notes.txt",
			artifact: { text: "cased" },
		});
		await expect(
			service.loadArtifact({ ...base, filename: "user:notes.txt" }),
		).resolves.toBeNull();
		await expect(
			service.loadArtifact({ ...base, filename: "User:notes.txt" }),
		).resolves.toEqual({ text: "cased" });
	});

	it("listArtifactKeys keeps User: under session prefix only", async () => {
		const service = new InMemoryArtifactService();
		await service.saveArtifact({
			...base,
			filename: "User:a.txt",
			artifact: { text: "a" },
		});
		await service.saveArtifact({
			...base,
			filename: "user:b.txt",
			artifact: { text: "b" },
		});
		const keys = await service.listArtifactKeys(base);
		expect(keys).toEqual(["User:a.txt", "user:b.txt"]);
	});

	it("user: prefix without name still namespaces", async () => {
		const service = new InMemoryArtifactService();
		await service.saveArtifact({
			...base,
			filename: "user:",
			artifact: { text: "edge" },
		});
		const paths = [...(service as any).artifacts.keys()] as string[];
		expect(paths).toEqual(["app/uid/user/user:"]);
	});

	it("user;colon lookalike stays session-scoped", async () => {
		const service = new InMemoryArtifactService();
		await service.saveArtifact({
			...base,
			filename: "user;notes.txt",
			artifact: { text: "semi" },
		});
		const paths = [...(service as any).artifacts.keys()] as string[];
		expect(paths).toEqual(["app/uid/sess-1/user;notes.txt"]);
	});
});
