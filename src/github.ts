import { github } from "./logging";

export type Repo = {
	name: string;
	fullName: string;
	owner: string;
	ownerAvatar: string;
	description: string | null;
	url: string;
	homepage: string | null;
	language: string | null;
	stars: number;
	forks: number;
	topics: string[];
	archived: boolean;
	pushedAt: string;
	forkOf?: string;
};

export type Contribution = Repo & {
	pushes: number;
	prs: number;
	issues: number;
	reviews: number;
	lastActive: string;
};

export type GithubState =
	| { user: null }
	| {
		user: { login: string; name: string | null; avatar: string; url: string; publicRepos: number; followers: number };
		repos: Repo[];
		contributions: Contribution[];
		fetchedAt: number;
	};

const API = "https://api.github.com";
const TTL = 30 * 60000;
const REPO_TTL = 6 * 60 * 60000;
const MAX_CONTRIBUTIONS = 12;
const RECENT_DAYS = 180;

let cache: { login: string; at: number; data: GithubState } | null = null;
let inflight: Promise<GithubState> | null = null;
const repoCache = new Map<string, { at: number; repo: Repo | null }>();

async function gh<T>(path: string): Promise<T> {
	const headers: Record<string, string> = {
		Accept: "application/vnd.github+json",
		"User-Agent": "personal-site",
		"X-GitHub-Api-Version": "2022-11-28",
	};
	if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
	const res = await fetch(`${API}${path}`, { headers });
	if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${path}`);
	return (await res.json()) as T;
}

const toRepo = (r: any): Repo => ({
	name: r.name,
	fullName: r.full_name,
	owner: r.owner?.login ?? "",
	ownerAvatar: r.owner?.avatar_url ?? "",
	description: r.description ?? null,
	url: r.html_url,
	homepage: r.homepage || null,
	language: r.language ?? null,
	stars: r.stargazers_count ?? 0,
	forks: r.forks_count ?? 0,
	topics: r.topics ?? [],
	archived: Boolean(r.archived),
	pushedAt: r.pushed_at,
	forkOf: r.parent?.full_name,
});

const workedOnFork = (r: any) =>
	r.fork && new Date(r.pushed_at).getTime() - new Date(r.created_at).getTime() > 60_000;

async function repoDetails(fullName: string) {
	const hit = repoCache.get(fullName);
	if (hit && Date.now() - hit.at < REPO_TTL) return hit.repo;
	try {
		const repo = toRepo(await gh(`/repos/${fullName}`));
		repoCache.set(fullName, { at: Date.now(), repo });
		return repo;
	} catch (err) {
		github(`couldn't fetch ${fullName}: ${(err as Error).message}`);
		return hit?.repo ?? null;
	}
}

async function contributions(login: string): Promise<Contribution[]> {
	const lower = login.toLowerCase();
	const since = Date.now() - RECENT_DAYS * 86_400000;
	const stats = new Map<string, Pick<Contribution, "pushes" | "prs" | "issues" | "reviews" | "lastActive">>();
	const seenPrs = new Set<string>();

	const bump = (fullName: string, field: "pushes" | "prs" | "issues" | "reviews", at: string) => {
		if (fullName.split("/")[0]?.toLowerCase() === lower) return;
		if (new Date(at).getTime() < since) return;
		const s = stats.get(fullName) ?? { pushes: 0, prs: 0, issues: 0, reviews: 0, lastActive: at };
		s[field]++;
		if (at > s.lastActive) s.lastActive = at;
		stats.set(fullName, s);
	};

	for (let page = 1; page <= 3; page++) {
		const events = await gh<any[]>(`/users/${login}/events/public?per_page=100&page=${page}`).catch(() => []);
		for (const e of events) {
			const repo = e.repo?.name as string | undefined;
			if (!repo) continue;
			if (e.type === "PushEvent") bump(repo, "pushes", e.created_at);
			else if (e.type === "PullRequestEvent" && e.payload?.action === "opened") {
				seenPrs.add(`${repo}#${e.payload.number ?? e.payload.pull_request?.number}`);
				bump(repo, "prs", e.created_at);
			} else if (e.type === "PullRequestReviewEvent") bump(repo, "reviews", e.created_at);
			else if (e.type === "IssuesEvent" && e.payload?.action === "opened") bump(repo, "issues", e.created_at);
		}
		if (events.length < 100) break;
	}

	try {
		const q = encodeURIComponent(`author:${login} is:pr -user:${login}`);
		const res = await gh<{ items: any[] }>(`/search/issues?q=${q}&sort=updated&order=desc&per_page=50`);
		for (const pr of res.items ?? []) {
			const repo = String(pr.repository_url ?? "").replace(`${API}/repos/`, "");
			if (!repo || seenPrs.has(`${repo}#${pr.number}`)) continue;
			bump(repo, "prs", pr.created_at);
			const s = stats.get(repo);
			if (s && pr.updated_at > s.lastActive && new Date(pr.updated_at).getTime() >= since) s.lastActive = pr.updated_at;
		}
	} catch (err) {
		github(`PR search failed: ${(err as Error).message}`);
	}

	const recent = [...stats.entries()]
		.sort((a, b) => b[1].lastActive.localeCompare(a[1].lastActive))
		.slice(0, MAX_CONTRIBUTIONS);

	const out = await Promise.all(
		recent.map(async ([fullName, s]) => {
			const repo = await repoDetails(fullName);
			return repo ? { ...repo, ...s } : null;
		}),
	);
	return out.filter((c): c is Contribution => c !== null);
}

async function fetchAll(login: string): Promise<GithubState> {
	const u = await gh<any>(`/users/${login}`);
	const [list, contribs] = await Promise.all([
		gh<any[]>(`/users/${login}/repos?type=owner&sort=pushed&per_page=100`),
		contributions(login),
	]);

	const own = list.filter((r) => (!r.fork || workedOnFork(r)) && r.name.toLowerCase() !== login.toLowerCase());
	const repos = await Promise.all(
		own.map(async (r) => (r.fork ? ((await repoDetails(r.full_name)) ?? toRepo(r)) : toRepo(r))),
	);
	return {
		user: {
			login: u.login,
			name: u.name ?? null,
			avatar: u.avatar_url,
			url: u.html_url,
			publicRepos: u.public_repos ?? 0,
			followers: u.followers ?? 0,
		},
		repos,
		contributions: contribs,
		fetchedAt: Date.now(),
	};
}

export async function getGithub(login: string | undefined): Promise<GithubState> {
	if (!login) return { user: null };
	const fresh = cache?.login === login && Date.now() - cache.at < TTL;
	if (fresh) return cache!.data;

	inflight ??= fetchAll(login)
		.then((data) => {
			cache = { login, at: Date.now(), data };
			github(`fetched ${data.user ? `${data.repos.length} repos, ${data.contributions.length} contributions` : "nothing"} for ${login}`);
			return data;
		})
		.catch((err) => {
			github(`fetch failed for ${login}: ${(err as Error).message}`);
			if (cache?.login === login) {
				cache.at = Date.now() - TTL + 5 * 60000;
				return cache.data;
			}
			return { user: null } as GithubState;
		})
		.finally(() => {
			inflight = null;
		});
	return inflight;
}
