import { Cache, ScopedMutator } from 'swr';

export default async function callApi(
  method: string,
  body: unknown
): Promise<any> {
  return fetch('/api/' + method, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  }).then((res) => {
    if (!res.ok) {
      throw new Error(`API call failed with status ${res.status}`);
    }
    return res.json();
  });
}

interface CacheableResponse {
  id: string;
}

export const useCache = async <T extends CacheableResponse>(
  url: string,
  cache: Cache<any>,
  mutate: ScopedMutator,
  idsToFetch: string[],
  getBodyForMissingIds?: (missingIds: string[]) => unknown
): Promise<T[]> => {
  const response: CacheableResponse[] = [];
  const missingIds: string[] = [];
  for (const id of idsToFetch) {
    const itemInCache = cache.get(url + '/' + id);
    if (itemInCache?.data) {
      response.push(itemInCache.data);
    } else {
      missingIds.push(id);
    }
  }
  if (missingIds.length > 0 && getBodyForMissingIds) {
    await callApi(url, getBodyForMissingIds(missingIds)).then((res) => {
      res.forEach((item: CacheableResponse) => {
        if (item.id) {
          cache.set(url + '/' + item.id, { data: item });
          // mutate(url + '/' + item.id, item);
          response.push(item);
        }
      });
    });
  }
  return response as T[];
};
