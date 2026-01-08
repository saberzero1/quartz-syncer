import { type App, Modal, getIcon, TFile, Vault } from "obsidian";
import QuartzSyncerSettings from "src/models/settings";
import QuartzSyncerSiteManager from "src/repositoryConnection/QuartzSyncerSiteManager";
import PublishStatusManager from "src/publisher/PublishStatusManager";
import Publisher from "src/publisher/Publisher";
import { PublishFile } from "src/publishFile/PublishFile";
import PublicationCenterSvelte from "src/views/PublicationCenter/PublicationCenter.svelte";
import DiffView from "src/views/PublicationCenter/DiffView.svelte";

/**
 * PublicationCenter class.
 * This class represents the publication center UI for managing the publishing status of notes.
 * It provides methods to open the modal, display the publication status, and show diffs between local and remote files.
 */
export class PublicationCenter {
	modal: Modal;
	settings: QuartzSyncerSettings;
	publishStatusManager: PublishStatusManager;
	publisher: Publisher;
	siteManager: QuartzSyncerSiteManager;
	vault: Vault;

	publicationCenterUi!: PublicationCenterSvelte;

	constructor(
		app: App,
		publishStatusManager: PublishStatusManager,
		publisher: Publisher,
		siteManager: QuartzSyncerSiteManager,
		settings: QuartzSyncerSettings,
	) {
		this.modal = new Modal(app);
		this.settings = settings;
		this.publishStatusManager = publishStatusManager;
		this.publisher = publisher;
		this.siteManager = siteManager;
		this.vault = app.vault;

		this.modal.titleEl
			.createEl("span", { text: "Publication center" })
			.prepend(this.getIcon("quartz-syncer-icon"));

		this.modal.titleEl.addClass("quartz-syncer-modal-title");
		this.modal.contentEl.addClass("quartz-syncer-modal-content");
	}

	/**
	 * Returns an icon element based on the provided name.
	 * If the icon is not found, it returns a span element.
	 *
	 * @param name - The name of the icon to retrieve.
	 * @returns A Node representing the icon.
	 */
	getIcon(name: string): Node {
		const icon = getIcon(name) ?? document.createElement("span");

		if (icon instanceof SVGSVGElement) {
			icon.addClass("quartz-syncer-svg-icon");
		}

		return icon;
	}

	/**
	 * Shows the diff between the remote and local versions of a note.
	 * It retrieves the content of both versions, compares them, and displays the differences in a modal.
	 *
	 * @param notePath - The path of the note to compare.
	 * @returns A promise that resolves when the diff is displayed.
	 * @throws Will throw an error if the note content cannot be retrieved or compiled.
	 */
	private showDiff = async (notePath: string) => {
		try {
			let remoteContent, remoteFile, localContent, localFile;

			if (this.settings.useCache) {
				await this.publisher.datastore.loadRemoteFile(notePath);

				remoteFile = remoteContent ? remoteContent[0] : undefined;
			}

			if (!remoteContent || !this.settings.useCache) {
				remoteFile = await this.siteManager.getNoteContent(notePath);
			}

			let localNotePath = "";

			if (
				this.settings.vaultPath !== "/" &&
				this.settings.vaultPath !== ""
			) {
				localNotePath = this.settings.vaultPath + notePath;
			} else {
				localNotePath = notePath;
			}

			if (this.settings.useCache) {
				localContent =
					await this.publisher.datastore.loadLocalFile(localNotePath);

				localFile = localContent ? localContent[0] : undefined;
			} else {
				localContent = this.vault.getFileByPath(localNotePath);

				if (!(localContent instanceof TFile)) {
					localFile = "";
				} else {
					localContent =
						await this.publisher.compiler.generateMarkdown(
							new PublishFile({
								file: localContent,
								vault: this.vault,
								compiler: this.publisher.compiler,
								datastore: this.publisher.datastore,
								metadataCache: this.publisher.metadataCache,
								settings: this.settings,
							}),
						);

					if (!localContent) {
						throw new Error(
							`Failed to compile local file: ${localNotePath}. Compiler returned null.`,
						);
					}

					localFile = localContent[0];
				}
			}

			if (remoteFile && localFile) {
				let diffView: DiffView | undefined;
				const diffModal = new Modal(this.modal.app);
				const title = notePath.split("/").pop() || "Diff";

				diffModal.titleEl
					.createEl("span", {
						text: `${title}`,
					})
					.prepend(this.getIcon("file-diff"));

				diffModal.onOpen = () => {
					diffView = new DiffView({
						target: diffModal.contentEl,
						props: {
							oldContent: remoteFile,
							newContent: localFile,
							fileName: title,
							defaultViewStyle: this.settings.diffViewStyle,
						},
					});
				};

				diffModal.onClose = () => {
					if (diffView) {
						diffView.$destroy();
					}
				};

				diffModal.open();
			}
		} catch (e) {
			console.error(e);
		}
	};

	/**
	 * Opens the publication center modal.
	 * It sets up the modal's content and behavior, including the publication status manager and publisher.
	 */
	open = () => {
		this.modal.onClose = () => {
			this.publicationCenterUi.$destroy();
		};

		this.modal.onOpen = () => {
			this.modal.contentEl.empty();

			this.publicationCenterUi = new PublicationCenterSvelte({
				target: this.modal.contentEl,
				props: {
					publishStatusManager: this.publishStatusManager,
					publisher: this.publisher,
					showDiff: this.showDiff,
					close: () => {
						this.modal.close();
					},
				},
			});
		};

		this.modal.open();
	};
}
