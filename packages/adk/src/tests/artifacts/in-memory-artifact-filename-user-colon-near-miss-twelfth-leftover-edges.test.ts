import { describe, expect, it } from "vitest";
import { InMemoryArtifactService } from "../../artifacts/in-memory-artifact-service";

/**
 * Twelfth leftover: fileHasUserNamespace is exact startsWith("user:").
 * Near-miss prefixes (`user`, `user;`, ` user:`, unicode colon) stay
 * session-scoped. Distinct from sixth/ninth USER:/User: case leftovers.
 */
describe("InMemoryArtifactService user: near-miss prefix twelfth leftover", () => {
	const base = {
		appName: "app",
		userId: "uid",
		sessionId: "s1",
	};

	it.each([
		{ filename: "user", path: "app/uid/s1/user" },
		{ filename: "user;x.txt", path: "app/uid/s1/user;x.txt" },
		{ filename: " user:x.txt", path: "app/uid/s1/ user:x.txt" },
		{ filename: "users:x.txt", path: "app/uid/s1/users:x.txt" },
		{ filename: "user：x.txt", path: "app/uid/s1/user：x.txt" },
	])("$filename stays session-scoped at $path", async ({ filename, path }) => {
		const service = new InMemoryArtifactService();
		await service.saveArtifact({
			...base,
			filename,
			artifact: { text: "body" },
		});
		expect((service as any).artifacts.has(path)).toBe(true);
		const keys = await service.listArtifactKeys(base);
		expect(keys).toContain(filename);
	});

	it("canonical user: still uses user/ namespace (control)", async () => {
		const service = new InMemoryArtifactService();
		await service.saveArtifact({
			...base,
			filename: "user:x.txt",
			artifact: { text: "ns" },
		});
		expect((service as any).artifacts.has("app/uid/user/user:x.txt")).toBe(
			true,
		);
	});
});
