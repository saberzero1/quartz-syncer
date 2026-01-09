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
		const legacyToken = settings.git?.auth?.secret;

		if (!legacyToken) {
			logger.debug(
				"No legacy token found in settings, skipping migration",
			);

			return false;
		}

		const existingToken = this.getToken();

		if (existingToken && existingToken !== "") {
			logger.debug(
				"Token already exists in secure storage, skipping migration",
			);

			if (settings.git?.auth?.secret) {
				settings.git.auth.secret = undefined;
				await saveSettings();

				logger.info(
					"Cleared legacy token from settings (secure storage already has token)",
				);
			}

			return false;
		}

		this.setToken(legacyToken);
		settings.git.auth.secret = undefined;
		await saveSettings();

		logger.info(
			"Successfully migrated Git authentication token from settings to secure storage",
		);

		return true;
	}

	listSecrets(): string[] {
		const allSecrets = this.secretStorage.listSecrets();

		return allSecrets.filter((id) => id.startsWith("quartz-syncer-"));
	}
}
