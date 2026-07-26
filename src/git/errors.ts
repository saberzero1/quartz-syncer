export class GitError extends Error {
	constructor(
		message: string,
		public readonly cause?: unknown,
	) {
		super(message);
		this.name = this.constructor.name;
	}
}

export class AuthError extends GitError {
	constructor(
		message = "Authentication failed",
		public readonly statusCode?: number,
		cause?: unknown,
	) {
		super(message, cause);
	}
}

export class NetworkError extends GitError {
	constructor(message = "Network request failed", cause?: unknown) {
		super(message, cause);
	}
}

export class RateLimitError extends GitError {
	constructor(
		message = "Rate limit exceeded",
		public readonly retryAfter?: number,
		public readonly remaining?: number,
		cause?: unknown,
	) {
		super(message, cause);
	}
}

export class ConflictError extends GitError {
	constructor(
		message = "Conflict detected",
		public readonly statusCode?: number,
		cause?: unknown,
	) {
		super(message, cause);
	}
}

export class NotFoundError extends GitError {
	constructor(
		message = "Resource not found",
		public readonly path?: string,
		cause?: unknown,
	) {
		super(message, cause);
	}
}

export class ProviderError extends GitError {
	constructor(message: string, cause?: unknown) {
		super(message, cause);
	}
}
