import { App, Platform, SecretStorage } from "obsidian";
import QuartzSyncerSettings from "src/models/settings";

const GIT_AUTH_SECRET_ID = "quartz-syncer-git-token";
const SAFE_STORAGE_KEY = "quartz-syncer-encrypted-token";

interface SafeStorage {
	isEncryptionAvailable(): boolean;
    // eslint-disable-next-line no-undef -- Buffer is available in Node.js and Electron environments
	encryptString(plainText: string): Buffer;
    // eslint-disable-next-line no-undef -- Buffer is available in Node.js and Electron environments
	decryptString(encrypted: Buffer): string;
}

function getSafeStorage(): SafeStorage | null {
	if (!Platform.isDesktopApp) return null;
	try {
		const electron = (
			window as unknown as { require: (id: string) => { safeStorage: SafeStorage } }
		).require("electron");
		const ss = electron.safeStorage;
		if (ss && typeof ss.isEncryptionAvailable === "function" && ss.isEncryptionAvailable()) {
			return ss;
		}
	} catch {
		// electron not available or safeStorage not supported
	}
	return null;
}

export class SecretStorageService {
	private secretStorage: SecretStorage;
	private safeStorage: SafeStorage | null;
	private cachedToken: string | null = null;
	readonly isEncrypted: boolean;

	constructor(app: App) {
		this.secretStorage = app.secretStorage;
		this.safeStorage = getSafeStorage();
		this.isEncrypted = this.safeStorage !== null;
	}

	getToken(): string | null {
		if (this.cachedToken !== null) {
			return this.cachedToken;
		}

		if (this.safeStorage) {
			const encrypted = this.secretStorage.getSecret(SAFE_STORAGE_KEY);
			if (encrypted) {
				try {
                    // eslint-disable-next-line no-undef -- Buffer is available in Node.js and Electron environments
					const buf = Buffer.from(encrypted, "base64");
					this.cachedToken = this.safeStorage.decryptString(buf);
					return this.cachedToken;
				} catch {
					// decryption failed — fall through to plaintext
				}
			}
		}

		const token = this.secretStorage.getSecret(GIT_AUTH_SECRET_ID);
		this.cachedToken = token;

		return token;
	}

	setToken(token: string): void {
		if (!token) {
			console.debug("Attempted to store empty token");
			return;
		}

		if (this.safeStorage) {
			const encrypted = this.safeStorage.encryptString(token);
			this.secretStorage.setSecret(SAFE_STORAGE_KEY, encrypted.toString("base64"));
			this.secretStorage.setSecret(GIT_AUTH_SECRET_ID, "");
			console.debug("Git authentication token stored with encryption");
		} else {
			this.secretStorage.setSecret(GIT_AUTH_SECRET_ID, token);
			console.debug("Git authentication token stored in secure storage");
		}

		this.cachedToken = token;
	}

	clearToken(): void {
		this.secretStorage.setSecret(GIT_AUTH_SECRET_ID, "");
		this.secretStorage.setSecret(SAFE_STORAGE_KEY, "");
		this.cachedToken = null;
		console.debug("Git authentication token cleared");
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
