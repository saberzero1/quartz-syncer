import { Octokit } from "./OctokitClient";
import { normalizePath } from "obsidian";
import Logger from "js-logger";
import { CompiledPublishFile } from "src/publishFile/PublishFile";

const logger = Logger.get("repository-connection");
const oktokitLogger = Logger.get("octokit");

/**
 * IOctokitterInput interface.
 * This interface defines the input parameters required to create a RepositoryConnection instance.
 */
interface IOctokitterInput {
	githubToken: string;
	githubUserName: string;
	quartzRepository: string;
	contentFolder: string;
	vaultPath: string;
}

/**
 * IPutPayload interface.
 * This interface defines the payload structure for updating files in the repository.
 */
interface IPutPayload {
	path: string;
	sha?: string;
	content: string;
	branch?: string;
	message?: string;
}

/**
 * RepositoryConnection class.
 * This class manages the connection to a GitHub repository using Octokit.
 * It provides methods to interact with the repository, such as getting content,
 * updating files, deleting files, and managing branches.
 * It also handles the conversion between repository paths and vault paths.
 */
export class RepositoryConnection {
	private githubUserName: string;
	private quartzRepository: string;
	octokit: Octokit;
	contentFolder: string;
	vaultPath: string;

	constructor({
		quartzRepository,
		githubToken,
		githubUserName,
		contentFolder,
		vaultPath,
	}: IOctokitterInput) {
		this.quartzRepository = quartzRepository;
		this.githubUserName = githubUserName;

		this.octokit = new Octokit({ auth: githubToken, log: oktokitLogger });

		this.contentFolder = contentFolder;
		this.vaultPath = vaultPath;
	}

	/**
	 * Get the full repository name in the format "username/repository".
	 *
	 * @returns The full repository name.
	 */
	getRepositoryName() {
		return this.githubUserName + "/" + this.quartzRepository;
	}

	/**
	 * Get the base payload for Octokit requests.
	 *
	 * @returns An object containing the owner and repo properties.
	 */
	getBasePayload() {
		return {
			owner: this.githubUserName,
			repo: this.quartzRepository,
		};
	}

	/**
	 * Get the repository path from a given path.
	 * If the path starts with the content folder, it removes that part.
	 * If the resulting path starts with a slash, it removes that as well.
	 *
	 * @param path - The path to convert.
	 * @returns The repository path.
	 */
	getRepositoryPath(path: string) {
		const repositoryPath = path.startsWith(this.contentFolder)
			? path.replace(this.contentFolder, "")
			: path;

		return repositoryPath.startsWith("/")
			? repositoryPath.slice(1)
			: repositoryPath;
	}

	/**
	 * Get the vault path from a given path.
	 * If the path starts with the vault path, it removes that part.
	 * If the resulting path starts with a slash, it removes that as well.
	 *
	 * @param path - The path to convert.
	 * @returns The vault path.
	 */
	getVaultPath(path: string) {
		path = normalizePath(path);

		const vaultPath = path.startsWith(this.vaultPath)
			? path.replace(this.vaultPath, "")
			: path;

		return vaultPath.startsWith("/") ? vaultPath.slice(1) : vaultPath;
	}

	/**
	 * Set the repository path from a given path.
	 * If the path does not start with the content folder, it prepends it.
	 * If the resulting path starts with a slash, it removes that as well.
	 *
	 * @param path - The path to convert.
	 * @returns The repository path.
	 */
	setRepositoryPath(path: string) {
		path = normalizePath(path);

		const repositoryPath = path.startsWith(this.contentFolder)
			? path
			: `${this.contentFolder}/${path}`;

		return repositoryPath.startsWith("/")
			? repositoryPath.slice(1)
			: repositoryPath;
	}

	/**
	 * Set the vault path from a given path.
	 * If the path does not start with the vault path, it prepends it.
	 * If the resulting path starts with a slash, it removes that as well.
	 *
	 * @param path - The path to convert.
	 * @returns The vault path.
	 */
	setVaultPath(path: string) {
		const separator = path.startsWith("/") ? "" : "/";

		const vaultPath = path.startsWith(this.vaultPath)
			? path
			: `${this.vaultPath}${separator}${path}`;

		return vaultPath.startsWith("/") ? vaultPath.slice(1) : vaultPath;
	}

	/**
	 * Convert a repository path to a vault path.
	 * It first converts the path to a repository path and then sets it as a vault path.
	 *
	 * @param path - The repository path to convert.
	 * @returns The vault path.
	 */
	repositoryToVaultPath(path: string) {
		return this.setVaultPath(this.getRepositoryPath(path));
	}

	/**
	 * Convert a vault path to a repository path.
	 * It first converts the path to a vault path and then sets it as a repository path.
	 *
	 * @param path - The vault path to convert.
	 * @returns The repository path.
	 */
	repositoryToRepositoryPath(path: string) {
		return this.setRepositoryPath(this.getVaultPath(path));
	}

	/**
	 * Get filetree with path and sha of each file from repository
	 *
	 * @param branch - The branch to get the content from.
	 * @returns The content of the repository as a tree structure.
	 * @throws Will throw an error if the content cannot be retrieved.
	 */
	async getContent(branch: string) {
		try {
			const response = await this.octokit.request(
				`GET /repos/{owner}/{repo}/git/trees/{tree_sha}`,
				{
					...this.getBasePayload(),
					tree_sha: branch,
					recursive: "true",
					// invalidate cache
					headers: {
						"If-None-Match": "",
					},
				},
			);

			if (response.status === 200) {
				return response.data;
			}
		} catch (_error) {
			throw new Error(
				`Could not get files from repository ${this.getRepositoryName()}`,
			);
		}
	}

	/**
	 * Get a file from the repository.
	 * It retrieves the file content from the specified path and branch.
	 *
	 * @param path - The path of the file to retrieve.
	 * @param branch - The branch to get the file from (optional).
	 * @returns The file data if found, otherwise undefined.
	 * @throws Will throw an error if the file cannot be retrieved.
	 */
	async getFile(path: string, branch?: string) {
		path = this.setRepositoryPath(
			this.getVaultPath(this.getRepositoryPath(path)),
		);

		logger.info(
			`Getting file ${path} from repository ${this.getRepositoryName()}`,
		);

		try {
			const response = await this.octokit.request(
				"GET /repos/{owner}/{repo}/contents/{path}",
				{
					...this.getBasePayload(),
					path,
					ref: branch,
				},
			);

			if (
				response.status === 200 &&
				!Array.isArray(response.data) &&
				response.data.type === "file"
			) {
				return response.data;
			}
		} catch (_error) {
			throw new Error(
				`Could not get file ${path} from repository ${this.getRepositoryName()}`,
			);
		}
	}

	/**
	 * Get the latest commit from the repository.
	 *
	 * @returns The latest commit data if found, otherwise undefined.
	 * @throws Will throw an error if the latest commit cannot be retrieved.
	 */
	async getLatestCommit(): Promise<
		{ sha: string; commit: { tree: { sha: string } } } | undefined
	> {
		try {
			const latestCommit = await this.octokit.request(
				`GET /repos/{owner}/{repo}/commits/HEAD?cacheBust=${Date.now()}`,
				this.getBasePayload(),
			);

			if (!latestCommit || !latestCommit.data) {
				logger.error("Could not get latest commit");
			}

			return latestCommit.data;
		} catch (error) {
			logger.error("Could not get latest commit", error);
		}
	}

	/**
	 * Mutate an arbitrary file in the repository.
	 * It updates the file content at the specified path and branch.
	 *
	 * @param path - The path of the file to update.
	 * @param sha - The SHA of the file to update (optional). Set to null to delete the file.
	 * @param content - The new content of the file.
	 * @param branch - The branch to update the file in (optional).
	 * @param message - The commit message for the update (optional).
	 * @returns The response data from the update request.
	 */
	async mutateFile({ path, sha, content, branch, message }: IPutPayload) {
		const payload = {
			...this.getBasePayload(),
			path,
			message: message ?? `Update file ${path}`,
			content,
			sha,
			branch,
		};

		try {
			return await this.octokit.request(
				"PUT /repos/{owner}/{repo}/contents/{path}",
				payload,
			);
		} catch (error) {
			logger.error(error);
		}
	}

	/**
	 * Delete multiple files from the repository.
	 * It retrieves the latest commit, creates a new tree with the files to be deleted,
	 * and commits the changes to the default branch.
	 *
	 * @param filePaths - An array of file paths to delete.
	 */
	async deleteFiles(filePaths: string[]) {
		const latestCommit = await this.getLatestCommit();

		if (!latestCommit) {
			logger.error("Could not get latest commit");

			return;
		}

		const normalizePath = (path: string) => {
			let previous;

			do {
				previous = path;
				path = path.replace(/\.\.\//g, "");
			} while (path !== previous);

			path = this.getVaultPath(path);

			return path.startsWith("/")
				? `${this.contentFolder}${path}`
				: `${this.contentFolder}/${path}`;
		};

		const filesToDelete = filePaths.map((path) => {
			return normalizePath(path);
		});

		const repoDataPromise = this.octokit.request(
			"GET /repos/{owner}/{repo}",
			{
				...this.getBasePayload(),
			},
		);

		const latestCommitSha = latestCommit.sha;
		const baseTreeSha = latestCommit.commit.tree.sha;

		const baseTree = await this.octokit.request(
			"GET /repos/{owner}/{repo}/git/trees/{tree_sha}?recursive=1",
			{
				...this.getBasePayload(),
				tree_sha: baseTreeSha,
			},
		);

		const newTreeEntries = baseTree.data.tree
			.filter((item: { path: string }) =>
				filesToDelete.includes(item.path),
			) // Mark sha of files to be deleted as null
			.map(
				(item: {
					path: string;
					mode: string;
					type: string;
					sha: string;
				}) => ({
					path: item.path,
					mode: item.mode,
					type: item.type,
					sha: null,
				}),
			);

		//eslint-disable-next-line
		const tree = newTreeEntries.filter((x: any) => x !== undefined) as {
			path?: string | undefined;
			mode?:
				| "100644"
				| "100755"
				| "040000"
				| "160000"
				| "120000"
				| undefined;
			type?: "tree" | "blob" | "commit" | undefined;
			sha?: string | null | undefined;
			content?: string | undefined;
		}[];

		const newTree = await this.octokit.request(
			"POST /repos/{owner}/{repo}/git/trees",
			{
				...this.getBasePayload(),
				base_tree: baseTreeSha,
				tree,
			},
		);

		const commitMessage = "Deleted multiple files";

		const newCommit = await this.octokit.request(
			"POST /repos/{owner}/{repo}/git/commits",
			{
				...this.getBasePayload(),
				message: commitMessage,
				tree: newTree.data.sha,
				parents: [latestCommitSha],
			},
		);

		const defaultBranch = (await repoDataPromise).data.default_branch;

		await this.octokit.request(
			"PATCH /repos/{owner}/{repo}/git/refs/heads/{branch}",
			{
				...this.getBasePayload(),
				branch: defaultBranch,
				sha: newCommit.data.sha,
			},
		);
	}

	/**
	 * Update multiple files in the repository.
	 * It retrieves the latest commit, creates a new tree with the files to be updated,
	 * and commits the changes to the default branch.
	 *
	 * @param files - An array of CompiledPublishFile objects to update.
	 */
	async updateFiles(files: CompiledPublishFile[]) {
		const latestCommit = await this.getLatestCommit();

		if (!latestCommit) {
			logger.error("Could not get latest commit");

			return;
		}

		const repoDataPromise = this.octokit.request(
			"GET /repos/{owner}/{repo}",
			{
				...this.getBasePayload(),
			},
		);

		const latestCommitSha = latestCommit.sha;
		const baseTreeSha = latestCommit.commit.tree.sha;

		const normalizePath = (path: string) => {
			let previous;

			do {
				previous = path;
				path = path.replace(/\.\.\//g, "");
			} while (path !== previous);

			path = this.getVaultPath(path);

			return path.startsWith("/")
				? `${this.contentFolder}${path}`
				: `${this.contentFolder}/${path}`;
		};

		const treePromises = files.map(async (file) => {
			const [text, _] = file.compiledFile;

			try {
				const blob = await this.octokit.request(
					"POST /repos/{owner}/{repo}/git/blobs",
					{
						...this.getBasePayload(),
						content: text,
						encoding: "utf-8",
					},
				);

				return {
					path: normalizePath(file.getPath()),
					mode: "100644",
					type: "blob",
					sha: blob.data.sha,
				};
			} catch (error) {
				logger.error(error);
			}
		});

		const treeAssetPromises = files
			.flatMap((x) => x.compiledFile[1].blobs)
			.map(async (asset) => {
				try {
					const blob = await this.octokit.request(
						"POST /repos/{owner}/{repo}/git/blobs",
						{
							...this.getBasePayload(),
							content: asset.content,
							encoding: "base64",
						},
					);

					return {
						path: normalizePath(asset.path),
						mode: "100644",
						type: "blob",
						sha: blob.data.sha,
					};
				} catch (error) {
					logger.error(error);
				}
			});
		treePromises.push(...treeAssetPromises);

		const treeList = await Promise.all(treePromises);

		//Filter away undefined values
		const tree = treeList.filter((x) => x !== undefined) as {
			path?: string | undefined;
			mode?:
				| "100644"
				| "100755"
				| "040000"
				| "160000"
				| "120000"
				| undefined;
			type?: "tree" | "blob" | "commit" | undefined;
			sha?: string | null | undefined;
			content?: string | undefined;
		}[];

		const newTree = await this.octokit.request(
			"POST /repos/{owner}/{repo}/git/trees",
			{
				...this.getBasePayload(),
				base_tree: baseTreeSha,
				tree,
			},
		);

		const commitMessage = "Published multiple files";

		const newCommit = await this.octokit.request(
			"POST /repos/{owner}/{repo}/git/commits",
			{
				...this.getBasePayload(),
				message: commitMessage,
				tree: newTree.data.sha,
				parents: [latestCommitSha],
			},
		);

		const defaultBranch = (await repoDataPromise).data.default_branch;

		await this.octokit.request(
			"PATCH /repos/{owner}/{repo}/git/refs/heads/{branch}",
			{
				...this.getBasePayload(),
				branch: defaultBranch,
				sha: newCommit.data.sha,
			},
		);
	}
}

/**
 * TRepositoryContent type.
 * This type represents the content of a repository as returned by the getContent method.
 * It is an awaited type of the return value of the getContent method of the RepositoryConnection class.
 */
export type TRepositoryContent = Awaited<
	ReturnType<typeof RepositoryConnection.prototype.getContent>
>;
