import type { Contribution, GithubState, Repo } from "../github";
import { $, ago, load, mount } from "./dom";
import { languageColor } from "./languages";

let retry: ReturnType<typeof setTimeout> | undefined;

export async function loadGithub(attempt = 0): Promise<void> {
	clearTimeout(retry);
	if (await load("/api/github", renderGithub)) return;
	retry = setTimeout(() => loadGithub(attempt + 1), Math.min(60000, 5000 * 2 ** attempt));
}

function RepoCard({ repo, contribution = "" }: { repo: Repo; contribution?: string }) {
	return (
		<a class="repo" href={repo.url} target="_blank" rel="noopener">
			<span class="repo-head">
				<img class="repo-owner" src={repo.ownerAvatar} alt="" width="20" height="20" loading="lazy" />
				<strong>{repo.fullName}</strong>
			</span>
			{repo.forkOf ? <small class="muted">forked from {repo.forkOf}</small> : null}
			<small class="repo-desc">{repo.description ?? "no description"}</small>
			{repo.topics.length ? <span class="topics">{repo.topics.slice(0, 5).map((topic) => <span class="tag">{topic}</span>)}</span> : null}
			<span class="repo-meta">
				{repo.language ? <span class="lang"><i style={`--c:${languageColor(repo.language)}`} />{repo.language}</span> : null}
				{repo.stars ? <span title="stars">★ {repo.stars}</span> : null}
				{repo.forks ? <span title="forks">⑂ {repo.forks}</span> : null}
				{repo.archived ? <span class="tag">archived</span> : null}
				{contribution}
				<span class="muted">updated {ago(repo.pushedAt)}</span>
			</span>
		</a>
	);
}

function contribCard(c: Contribution) {
	const bits = [
		c.prs && `${c.prs} PR${c.prs > 1 ? "s" : ""}`,
		c.pushes && `${c.pushes} push${c.pushes > 1 ? "es" : ""}`,
		c.reviews && `${c.reviews} review${c.reviews > 1 ? "s" : ""}`,
		c.issues && `${c.issues} issue${c.issues > 1 ? "s" : ""}`,
	].filter(Boolean);
	return <RepoCard repo={{ ...c, pushedAt: c.lastActive }} contribution={bits.length ? ` ${bits.join(" · ")}` : ""} />;
}

export function renderGithub(data: GithubState) {
	const repos = $("repo-list");
	const contribs = $("contrib-list");
	const link = $<HTMLAnchorElement>("gh-link");

	if (!data.user) {
		if (repos) mount(<p class="muted small">couldn't load github — check <code>username</code> in profile.json</p>, repos);
		if (contribs) mount(null, contribs);
		return;
	}

	if (link) {
		link.href = data.user.url;
		link.textContent = `@${data.user.login} ↗`;
	}

	if (repos) {
		mount(data.repos.length ? <>{data.repos.map((repo) => <RepoCard repo={repo} />)}</> : <p class="muted small">no public repos yet~</p>, repos);
	}

	if (contribs) {
		mount(data.contributions.length ? <>{data.contributions.map(contribCard)}</> : <p class="muted small">no recent contributions to other repos</p>, contribs);
	}
}
