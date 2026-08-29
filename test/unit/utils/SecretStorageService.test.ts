import { SecretStorageService } from "src/utils/SecretStorageService";
import { App } from "obsidian";

function createMockApp(secrets: Record<string, string> = {}): App {
	const store = { ...secrets };
	return {
		secretStorage: {
			getSecret: (id: string) => store[id] ?? null,
			setSecret: (id: string, value: string) => {
				store[id] = value;
			},
			listSecrets: () => Object.keys(store),
		},
	} as unknown as App;
}

describe("SecretStorageService", () => {
	describe("basic token operations", () => {
		it("stores and retrieves a token", () => {
			const app = createMockApp();
			const service = new SecretStorageService(app);

			expect(service.hasToken()).toBe(false);
			service.setToken("ghp_test123");
			expect(service.hasToken()).toBe(true);
			expect(service.getToken()).toBe("ghp_test123");
		});

		it("clears a token", () => {
			const app = createMockApp();
			const service = new SecretStorageService(app);

			service.setToken("ghp_test123");
			service.clearToken();
			expect(service.hasToken()).toBe(false);
		});

		it("ignores empty token", () => {
			const app = createMockApp();
			const service = new SecretStorageService(app);

			service.setToken("");
			expect(service.hasToken()).toBe(false);
		});

		it("reads existing token from storage", () => {
			const app = createMockApp({
				"quartz-syncer-git-token": "existing-token",
			});
			const service = new SecretStorageService(app);

			expect(service.getToken()).toBe("existing-token");
			expect(service.hasToken()).toBe(true);
		});
	});

	describe("isEncrypted flag", () => {
		it("reports false when safeStorage is unavailable", () => {
			const app = createMockApp();
			const service = new SecretStorageService(app);

			expect(service.isEncrypted).toBe(false);
		});
	});

	describe("migration", () => {
		it("migrates pending token from settings", async () => {
			const app = createMockApp();
			const service = new SecretStorageService(app);
			const settings = {
				_pendingTokenMigration: "migrated-token",
			} as unknown as import("src/models/settings").default;

			const migrated = await service.migrateFromSettings(
				settings,
				async () => {},
			);

			expect(migrated).toBe(true);
			expect(service.getToken()).toBe("migrated-token");
		});

		it("skips migration if token already exists", async () => {
			const app = createMockApp({
				"quartz-syncer-git-token": "existing",
			});
			const service = new SecretStorageService(app);
			const settings = {
				_pendingTokenMigration: "new-token",
			} as unknown as import("src/models/settings").default;

			const migrated = await service.migrateFromSettings(
				settings,
				async () => {},
			);

			expect(migrated).toBe(false);
			expect(service.getToken()).toBe("existing");
		});
	});

	describe("listSecrets", () => {
		it("filters to quartz-syncer prefixed secrets", () => {
			const app = createMockApp({
				"quartz-syncer-git-token": "token",
				"quartz-syncer-encrypted-token": "enc",
				"other-plugin-secret": "other",
			});
			const service = new SecretStorageService(app);

			const secrets = service.listSecrets();
			expect(secrets).toContain("quartz-syncer-git-token");
			expect(secrets).toContain("quartz-syncer-encrypted-token");
			expect(secrets).not.toContain("other-plugin-secret");
		});
	});
});
