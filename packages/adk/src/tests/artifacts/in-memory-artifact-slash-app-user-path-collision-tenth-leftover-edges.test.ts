import { describe, expect, it } from "vitest";
import { InMemoryArtifactService } from "../../artifacts/in-memory-artifact-service";

/**
 * Tenth leftover: getArtifactPath concatenates appName/userId/sessionId with
 * raw slashes, so ("a/b","c") and ("a","b/c") share a map key and overwrite.
 */
describe("InMemoryArtifactService slash app/user path collision tenth leftover", () => {
	it("appName with slash collides with userId that encodes the same segments", async () => {
		const service = new InMemoryArtifactService();
		await service.saveArtifact({
			appName: "a/b",
			userId: "c",
			sessionId: "s",
			filename: "note.txt",
			artifact: { text: "from-app-slash" },
		});
		await service.saveArtifact({
			appName: "a",
			userId: "b/c",
			sessionId: "s",
			filename: "note.txt",
			artifact: { text: "from-user-slash" },
		});

		await expect(
			service.loadArtifact({
				appName: "a/b",
				userId: "c",
				sessionId: "s",
				filename: "note.txt",
			}),
		).resolves.toEqual({ text: "from-user-slash" });
		await expect(
			service.loadArtifact({
				appName: "a",
				userId: "b/c",
				sessionId: "s",
				filename: "note.txt",
			}),
		).resolves.toEqual({ text: "from-user-slash" });
		expect((service as any).artifacts.size).toBe(1);
		expect((service as any).artifacts.has("a/b/c/s/note.txt")).toBe(true);
	});

	it("sessionId slash collides with filename that starts at the same segment", async () => {
		const service = new InMemoryArtifactService();
		await service.saveArtifact({
			appName: "app",
			userId: "uid",
			sessionId: "sess/nested",
			filename: "file.txt",
			artifact: { text: "session-nested" },
		});
		await service.saveArtifact({
			appName: "app",
			userId: "uid",
			sessionId: "sess",
			filename: "nested/file.txt",
			artifact: { text: "filename-nested" },
		});

		await expect(
			service.loadArtifact({
				appName: "app",
				userId: "uid",
				sessionId: "sess/nested",
				filename: "file.txt",
			}),
		).resolves.toEqual({ text: "filename-nested" });
	});

	it("user: namespace still isolates from session slash collision", async () => {
		const service = new InMemoryArtifactService();
		await service.saveArtifact({
			appName: "app",
			userId: "uid",
			sessionId: "user/x",
			filename: "note.txt",
			artifact: { text: "session" },
		});
		await service.saveArtifact({
			appName: "app",
			userId: "uid",
			sessionId: "ignored",
			filename: "user:note.txt",
			artifact: { text: "user-ns" },
		});

		await expect(
			service.loadArtifact({
				appName: "app",
				userId: "uid",
				sessionId: "user/x",
				filename: "note.txt",
			}),
		).resolves.toEqual({ text: "session" });
		await expect(
			service.loadArtifact({
				appName: "app",
				userId: "uid",
				sessionId: "other",
				filename: "user:note.txt",
			}),
		).resolves.toEqual({ text: "user-ns" });
	});

	it("listArtifactKeys for slash-colliding identities returns the shared filename", async () => {
		const service = new InMemoryArtifactService();
		await service.saveArtifact({
			appName: "a/b",
			userId: "c",
			sessionId: "s",
			filename: "shared.txt",
			artifact: { text: "one" },
		});
		const keys = await service.listArtifactKeys({
			appName: "a",
			userId: "b/c",
			sessionId: "s",
		});
		expect(keys).toEqual(["shared.txt"]);
	});

	it("delete through one identity removes the collided sibling", async () => {
		const service = new InMemoryArtifactService();
		await service.saveArtifact({
			appName: "a/b",
			userId: "c",
			sessionId: "s",
			filename: "gone.txt",
			artifact: { text: "x" },
		});
		await service.deleteArtifact({
			appName: "a",
			userId: "b/c",
			sessionId: "s",
			filename: "gone.txt",
		});
		await expect(
			service.loadArtifact({
				appName: "a/b",
				userId: "c",
				sessionId: "s",
				filename: "gone.txt",
			}),
		).resolves.toBeNull();
	});
});
