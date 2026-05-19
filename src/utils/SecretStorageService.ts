import { App, SecretStorage } from "obsidian";
import Logger from "js-logger";
import QuartzSyncerSettings from "src/models/settings";

const logger = Logger.get("secret-storage-service");

const GIT_AUTH_SECRET_ID = "quartz-syncer-git-token";

export class SecretStorageService {
	private secretStorage: SecretStorage;
	private cachedToken: string | null = null;

	constructor(app: App) {
		this.secretStorage = app.secretStorage;
	}

	getToken(): string | null {
		if (this.cachedToken !== null) {
			return this.cachedToken;
		}

		const token = this.secretStorage.getSecret(GIT_AUTH_SECRET_ID);
		this.cachedToken = token;

		return token;
	}

	setToken(token: string): void {
		if (!token) {
			logger.warn("Attempted to store empty token");

			return;
		}

		this.secretStorage.setSecret(GIT_AUTH_SECRET_ID, token);
		this.cachedToken = token;
		logger.info("Git authentication token stored in secure storage");
	}

	clearToken(): void {
		this.secretStorage.setSecret(GIT_AUTH_SECRET_ID, "");
		this.cachedToken = null;
		logger.info("Git authentication token cleared from secure storage");
	}

	hasToken(): boolean {
		const token = this.getToken();

		return token !== null && token !== "";
	}

	async migrateFromSettings(
		settings: QuartzSyncerSettings,
		saveSettings: () => Promise<void>,
	): Promise<boolean> {
		const raw = settings as unknown as Record<string, unknown>;
		const pendingToken = raw["_pendingTokenMigration"];

		const legacyToken =
			typeof pendingToken === "string" && pendingToken
				? pendingToken
				: this.getLegacyToken(raw);

		if (!legacyToken) {
			return false;
		}

		const existingToken = this.getToken();

		if (existingToken && existingToken !== "") {
			if (this.clearLegacyToken(raw)) {
				await saveSettings();
			}

			return false;
		}

		this.setToken(legacyToken);

		if (this.clearLegacyToken(raw)) {
			await saveSettings();
		}

		return true;
	}

	private getLegacyToken(
		settings: Record<string, unknown>,
	): string | undefined {
		const rawGit = settings["git"];

		if (!rawGit || typeof rawGit !== "object") {
			return undefined;
		}

		const auth = (rawGit as Record<string, unknown>)["auth"];

		if (!auth || typeof auth !== "object") {
			return undefined;
		}

		const secret = (auth as Record<string, unknown>)["secret"];

		return typeof secret === "string" && secret ? secret : undefined;
	}

	private clearLegacyToken(settings: Record<string, unknown>): boolean {
		let didClear = false;

		if ("_pendingTokenMigration" in settings) {
			delete settings["_pendingTokenMigration"];
			didClear = true;
		}

		const rawGit = settings["git"];

		if (rawGit && typeof rawGit === "object") {
			const auth = (rawGit as Record<string, unknown>)["auth"];

			if (auth && typeof auth === "object" && "secret" in auth) {
				(auth as Record<string, unknown>).secret = undefined;
				didClear = true;
			}
		}

		return didClear;
	}

	listSecrets(): string[] {
		const allSecrets = this.secretStorage.listSecrets();

		return allSecrets.filter((id) => id.startsWith("quartz-syncer-"));
	}
}
