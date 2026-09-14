import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createStore, dropStore } from "src/cache/IndexedDBStore";

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

describe("batched cache I/O", () => {
	const values = new Map<string, unknown>();
	let issuedPerTransaction: string[][];
	let transaction: ReturnType<typeof vi.fn>;
	let open: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		vi.useFakeTimers();
		values.clear();
		issuedPerTransaction = [];
		transaction = vi.fn(() => {
			let active = true;
			const keys: string[] = [];
			const requests: Array<{
				result: unknown;
				onsuccess?: () => void;
			}> = [];
			issuedPerTransaction.push(keys);
			const get = (key: string) => {
				if (!active)
					throw new DOMException(
						"Inactive",
						"TransactionInactiveError",
					);
				const request: { result: unknown; onsuccess?: () => void } = {
					result: values.get(key),
				};
				keys.push(key);
				requests.push(request);
				if (requests.length === 1) {
					setTimeout(() => {
						// Complete out of order, then auto-commit before a caller
						// can issue another get after awaiting a result.
						for (const pending of [...requests].reverse())
							pending.onsuccess?.();
						active = false;
					}, 0);
				}
				return request;
			};
			const put = (value: unknown, key: string) => {
				const request = get(key);
				values.set(key, value);
				request.result = key;
				return request;
			};
			return { objectStore: () => ({ get, put }) };
		});
		open = vi.fn(() => {
			const request = {
				result: {
					objectStoreNames: { contains: () => true },
					transaction,
				},
				onsuccess: null as (() => void) | null,
			};
			queueMicrotask(() => request.onsuccess?.());
			return request;
		});
		vi.stubGlobal("indexedDB", { open });
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	it.each([0, 1, 499, 500, 501, 999, 1000, 1001, 10_000])(
		"issues all requests synchronously in one transaction per chunk for %i keys",
		async (count) => {
			const keys = Array.from(
				{ length: count },
				(_, index) => `key-${index}`,
			);
			for (const key of keys) values.set(key, key);
			const pending = createStore("test-db").getMany<string>(keys);
			await vi.runAllTimersAsync();

			await expect(pending).resolves.toEqual(keys);
			expect(transaction).toHaveBeenCalledTimes(Math.ceil(count / 500));
			expect(issuedPerTransaction).toEqual(
				Array.from({ length: Math.ceil(count / 500) }, (_, index) =>
					keys.slice(index * 500, (index + 1) * 500),
				),
			);
			for (const call of transaction.mock.calls)
				expect(call).toEqual(["keyvaluepairs", "readonly"]);
			if (count === 0) expect(open).not.toHaveBeenCalled();
		},
	);

	it("preserves input order, duplicates, falsy values, and missing keys as null", async () => {
		values.set("a", 0);
		values.set("b", false);
		values.set("c", "");
		values.set("null", null);
		const pending = createStore("test-db").getMany<unknown>([
			"b",
			"missing",
			"a",
			"c",
			"b",
			"null",
		]);
		await vi.runAllTimersAsync();
		await expect(pending).resolves.toEqual([
			false,
			null,
			0,
			"",
			false,
			null,
		]);
	});

	it.each([0, 1, 499, 500, 501, 999, 1000, 1001, 10_000])(
		"setMany issues synchronous puts in one readwrite transaction per chunk for %i entries",
		async (count) => {
			const entries = Array.from({ length: count }, (_, index) => ({
				key: `key-${index}`,
				value: { index },
			}));
			const pending = createStore("test-db").setMany(entries);
			await vi.runAllTimersAsync();
			await expect(pending).resolves.toBeUndefined();
			expect(transaction).toHaveBeenCalledTimes(Math.ceil(count / 500));
			expect(issuedPerTransaction).toEqual(
				Array.from({ length: Math.ceil(count / 500) }, (_, index) =>
					entries
						.slice(index * 500, (index + 1) * 500)
						.map(({ key }) => key),
				),
			);
			for (const call of transaction.mock.calls)
				expect(call).toEqual(["keyvaluepairs", "readwrite"]);
			for (const { key, value } of entries)
				expect(values.get(key)).toEqual(value);
			if (count === 0) expect(open).not.toHaveBeenCalled();
		},
	);

	it("setMany preserves falsy values and the last write to duplicate keys", async () => {
		const pending = createStore("test-db").setMany<unknown>([
			{ key: "duplicate", value: "first" },
			{ key: "zero", value: 0 },
			{ key: "false", value: false },
			{ key: "empty", value: "" },
			{ key: "duplicate", value: null },
		]);
		await vi.runAllTimersAsync();
		await pending;
		expect(Object.fromEntries(values)).toEqual({
			duplicate: null,
			zero: 0,
			false: false,
			empty: "",
		});
		expect(transaction).toHaveBeenCalledTimes(1);
	});
});

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
