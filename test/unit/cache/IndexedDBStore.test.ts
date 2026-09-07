import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dropStore } from "src/cache/IndexedDBStore";

type FakeRequest = {
	onsuccess: (() => void) | null;
	onerror: (() => void) | null;
	onblocked: (() => void) | null;
	error: DOMException | null;
	result: undefined;
};

function makeFakeRequest(): FakeRequest {
	return {
		onsuccess: null,
		onerror: null,
		onblocked: null,
		error: null,
		result: undefined,
	};
}

describe("dropStore()", () => {
	let fakeRequest: FakeRequest;
	let mockDeleteDatabase: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		vi.useFakeTimers();
		fakeRequest = makeFakeRequest();
		mockDeleteDatabase = vi.fn(() => fakeRequest);
		Object.defineProperty(globalThis, "indexedDB", {
			value: { deleteDatabase: mockDeleteDatabase },
			writable: true,
			configurable: true,
		});
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("resolves when the request fires onsuccess", async () => {
		const promise = dropStore("test-db");
		fakeRequest.onsuccess?.();
		await expect(promise).resolves.toBeUndefined();
	});

	it("rejects when the request fires onerror, surfacing request.error", async () => {
		const cause = new DOMException("disk full", "QuotaExceededError");
		fakeRequest.error = cause;
		const promise = dropStore("test-db");
		fakeRequest.onerror?.();
		await expect(promise).rejects.toBe(cause);
	});

	it("does not resolve or reject immediately when onblocked fires, then resolves after the 10-second timeout", async () => {
		const promise = dropStore("test-db");

		fakeRequest.onblocked?.();

		let settled = false;
		void promise.then(
			() => {
				settled = true;
			},
			() => {
				settled = true;
			},
		);

		await vi.advanceTimersByTimeAsync(9_999);
		expect(settled).toBe(false);

		await vi.advanceTimersByTimeAsync(1);
		expect(settled).toBe(true);
		await expect(promise).resolves.toBeUndefined();
	});

	it("resolves via onsuccess when onsuccess fires after onblocked, without double-settling", async () => {
		const settled: string[] = [];

		const promise = dropStore("test-db").then(
			() => {
				settled.push("resolve");
			},
			() => {
				settled.push("reject");
			},
		);

		fakeRequest.onblocked?.();
		fakeRequest.onsuccess?.();

		await promise;

		expect(settled).toEqual(["resolve"]);

		await vi.advanceTimersByTimeAsync(15_000);
		expect(settled).toHaveLength(1);
	});

	it("rejects synchronously if indexedDB.deleteDatabase throws", async () => {
		const syncError = new Error("deleteDatabase unavailable");
		mockDeleteDatabase.mockImplementationOnce(() => {
			throw syncError;
		});

		await expect(dropStore("test-db")).rejects.toBe(syncError);
	});

	it("wraps a non-Error synchronous throw in an Error", async () => {
		mockDeleteDatabase.mockImplementationOnce(() => {
			throw "string-error";
		});

		const promise = dropStore("test-db");
		await expect(promise).rejects.toBeInstanceOf(Error);
		await expect(promise).rejects.toHaveProperty("message", "string-error");
	});
});
