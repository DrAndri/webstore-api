// Reads and commits the store configs in the webstore-scraper repository
import { HttpError } from './api';
import { AdminUser } from './session';
import { ConfigCommit } from './types';

const repo = () => {
  const value = process.env.GITHUB_CONFIG_REPO;
  if (!value) throw new HttpError(503, 'GITHUB_CONFIG_REPO is not set');
  return value;
};
const branch = () => process.env.GITHUB_CONFIG_BRANCH ?? 'master';
const configDir = () => process.env.GITHUB_CONFIG_DIR ?? 'stores';

export const configPath = (storeId: number) =>
  `${configDir()}/${storeId}.jsonc`;
export const fileUrl = (storeId: number) =>
  `https://github.com/${repo()}/blob/${branch()}/${configPath(storeId)}`;
// The configs were in one file before they were split per store
export const legacyHistoryUrl = () =>
  `https://github.com/${repo()}/commits/${branch()}/crawler/storeConfigs.ts`;

const github = async <T>(
  path: string,
  init: { method?: string; body?: unknown } = {}
): Promise<{ status: number; data?: T }> => {
  const token = process.env.GITHUB_TOKEN;
  const response = await fetch(
    `https://api.github.com/repos/${repo()}/${path}`,
    {
      method: init.method ?? 'GET',
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'webstore-api-admin',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init.body ? { 'Content-Type': 'application/json' } : {})
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
      cache: 'no-store'
    }
  );
  if (response.status === 404) return { status: 404 };
  if (!response.ok) {
    const text = await response.text();
    console.error(
      `GitHub ${init.method ?? 'GET'} ${path}: ${response.status} ${text}`
    );
    return { status: response.status };
  }
  return { status: response.status, data: (await response.json()) as T };
};

const githubError = (status: number) =>
  new HttpError(502, `GitHub returned ${status}`);

const decode = (content: string) =>
  Buffer.from(content, 'base64').toString('utf8');

export const getConfigFile = async (
  storeId: number,
  ref = branch()
): Promise<{ text: string; sha: string } | null> => {
  const { status, data } = await github<{ content: string; sha: string }>(
    `contents/${configPath(storeId)}?ref=${encodeURIComponent(ref)}`
  );
  if (status === 404) return null;
  if (!data) throw githubError(status);
  return { text: decode(data.content), sha: data.sha };
};

let listCache: { at: number; ids: Set<number> } | undefined;

// Ids of the stores with a config file, cached for a short while since the
// dashboard polls
export const listConfigIds = async (): Promise<Set<number> | undefined> => {
  if (listCache && Date.now() - listCache.at < 30 * 1000) return listCache.ids;
  try {
    const { status, data } = await github<{ name: string; type: string }[]>(
      `contents/${configDir()}?ref=${encodeURIComponent(branch())}`
    );
    if (!data) throw githubError(status);
    const ids = new Set(
      data
        .map((entry) => /^(\d+)\.jsonc$/.exec(entry.name)?.[1])
        .filter((id): id is string => id !== undefined)
        .map(Number)
    );
    listCache = { at: Date.now(), ids };
    return ids;
  } catch (e) {
    console.error('Listing store configs failed', e);
    return listCache?.ids;
  }
};

// Commits the config as the signed in admin. sha is the blob sha of the file
// that was edited, GitHub rejects the commit if the file has changed since.
export const saveConfigFile = async (
  storeId: number,
  text: string,
  sha: string | null,
  message: string,
  user: AdminUser
) => {
  const { status, data } = await github<{
    content: { sha: string };
    commit: { sha: string; html_url: string };
  }>(`contents/${configPath(storeId)}`, {
    method: 'PUT',
    body: {
      message,
      content: Buffer.from(text, 'utf8').toString('base64'),
      branch: branch(),
      ...(sha ? { sha } : {}),
      author: {
        name: user.name || user.login,
        email: `${user.id}+${user.login}@users.noreply.github.com`
      }
    }
  });
  if (status === 409 || status === 422)
    throw new HttpError(
      409,
      'The config was changed by someone else. Reload it and apply your changes again.'
    );
  if (!data) throw githubError(status);
  listCache = undefined;
  return {
    sha: data.content.sha,
    commitSha: data.commit.sha,
    commitUrl: data.commit.html_url
  };
};

interface GithubCommit {
  sha: string;
  html_url: string;
  commit: { message: string; author: { name: string; date: string } };
  author: { login: string; avatar_url: string } | null;
  files?: { filename: string; patch?: string; status: string }[];
}

export const getConfigHistory = async (
  storeId: number
): Promise<ConfigCommit[]> => {
  const { status, data } = await github<GithubCommit[]>(
    `commits?sha=${encodeURIComponent(branch())}&path=${encodeURIComponent(configPath(storeId))}&per_page=100`
  );
  if (status === 404) return [];
  if (!data) throw githubError(status);
  return data.map((commit) => ({
    sha: commit.sha,
    message: commit.commit.message,
    authorName: commit.commit.author.name,
    authorLogin: commit.author?.login ?? null,
    avatarUrl: commit.author?.avatar_url ?? null,
    date: commit.commit.author.date,
    url: commit.html_url
  }));
};

export const getConfigCommit = async (storeId: number, sha: string) => {
  if (!/^[0-9a-f]{7,40}$/i.test(sha))
    throw new HttpError(400, 'Invalid commit');
  const [{ status, data }, file] = await Promise.all([
    github<GithubCommit>(`commits/${sha}`),
    getConfigFile(storeId, sha)
  ]);
  if (!data)
    throw status === 404
      ? new HttpError(404, 'Commit not found')
      : githubError(status);
  const change = data.files?.find((f) => f.filename === configPath(storeId));
  return {
    patch: change?.patch ?? null,
    fileStatus: change?.status ?? null,
    text: file?.text ?? null
  };
};
