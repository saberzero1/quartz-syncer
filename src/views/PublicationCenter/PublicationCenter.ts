import { type App, Modal, getIcon, Vault } from "obsidian";
import QuartzSyncerSettings from "src/models/settings";
import QuartzSyncerSiteManager from "src/repositoryConnection/QuartzSyncerSiteManager";
import PublishStatusManager from "src/publisher/PublishStatusManager";
import Publisher from "src/publisher/Publisher";
import PublicationCenterSvelte from "src/views/PublicationCenter/PublicationCenter.svelte";
import DiffView from "src/views/PublicationCenter/DiffView.svelte";
import * as Diff from "diff";

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

	getIcon(name: string): Node {
		const icon = getIcon(name) ?? document.createElement("span");

		if (icon instanceof SVGSVGElement) {
			icon.addClass("quartz-syncer-svg-icon");
		}

		return icon;
	}

	private showDiff = async (notePath: string) => {
		try {
			const remoteContent =
				await this.publisher.datastore.loadRemoteFile(notePath);

			let remoteFile = remoteContent ? remoteContent[0] : undefined;

			if (!remoteContent) {
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

			const localFile =
				await this.publisher.datastore.loadLocalFile(localNotePath);

			if (remoteFile && localFile) {
				const diff = Diff.diffLines(remoteFile, localFile[0]);
				let diffView: DiffView | undefined;
				const diffModal = new Modal(this.modal.app);

				diffModal.titleEl
					.createEl("span", { text: `${notePath.split("/")[-1]}` })
					.prepend(this.getIcon("file-diff"));

				diffModal.onOpen = () => {
					diffView = new DiffView({
						target: diffModal.contentEl,
						props: { diff: diff },
					});
				};

				this.modal.onClose = () => {
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
