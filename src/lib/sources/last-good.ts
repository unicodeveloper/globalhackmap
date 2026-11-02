import "server-only";

const store = new Map<string, unknown>();

/**
 * Remember the last successful result of a feed in this server instance and fall back to it when
 * the upstream fails, so one flaky feed does not blank a whole section of the map.
 */
export async function withLastGood<T>(name: string, fetcher: () => Promise<T>, isEmpty: (value: T) => boolean = () => false): Promise<T> {
  try {
    const value = await fetcher();
    if (!isEmpty(value) || !store.has(name)) store.set(name, value);
    return isEmpty(value) && store.has(name) ? (store.get(name) as T) : value;
  } catch (error) {
    if (store.has(name)) return store.get(name) as T;
    throw error;
  }
}
