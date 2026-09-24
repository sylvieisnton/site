import profileJson from "../data/example.profile.json";
import { render } from "preact";
import type { Activity } from "../discord";
import { renderActivities } from "./activities";
import { $, load, set } from "./dom";

export type Profile = Omit<typeof profileJson, "discord" | "pronouns"> & {
	pronouns: string[];
	statusEmoji?: string;
	presence?: "online" | "idle" | "dnd" | "offline" | null;
	activities?: Activity[];
	banner?: string | null;
	accentColor?: string | null;
	platforms?: string[];
	discord?: { id: string; username: string } | null;
};

export const fallbackProfile: Profile = {
	...profileJson,
	avatar: profileJson.avatar || "",
	activities: [],
	discord: null,
};

export const firstName = (p: Profile) => p.name.split(" ")[0] ?? p.name;

export const loadProfile = () => load("/api/profile", renderProfile);

export function renderProfile(p: Profile) {
	const first = firstName(p);
	set("host", location.host);
	set("name-username", p.discord?.username ?? p.username);
	set("tagline", p.tagline);
	set("bio", p.bio.join(" "));
	set("year", String(new Date().getFullYear()));
	document.title = `${first}'s website`;

	const notice = $("notice");
	if (notice) {
		const text = p.notice?.trim() ?? "";
		if (text) render(<span dangerouslySetInnerHTML={{ __html: text }} />, notice);
		else notice.remove();
	}

	renderAvatar(p);
	renderHello(first);
	set("username", p.discord?.username ? `@${p.discord.username}` : `@${p.username}`);
	renderFacts(p);
	renderSocials(p);
	renderActivities(p.activities ?? []);
}

function renderAvatar(p: Profile) {
	const avatar = $<HTMLImageElement>("avatar");
	if (avatar && p.avatar && avatar.src !== new URL(p.avatar, location.href).href) avatar.src = p.avatar;
	const icon = document.querySelector<HTMLLinkElement>("link[rel=icon]");
	if (icon && p.avatar) icon.href = p.avatar;

	const presence = $("presence");
	if (presence) {
		const state = p.presence ?? "offline";
		presence.dataset.state = state;
		presence.dataset.mobile = String(p.platforms?.length === 1 && p.platforms[0] === "mobile");
		presence.title = p.platforms?.length ? `${state} on ${p.platforms.join(", ")}` : state;
		presence.hidden = !p.presence;
	}

	const card = document.querySelector<HTMLElement>(".profile");
	if (card) {
		card.style.setProperty("--banner", p.banner ? `url("${p.banner}")` : "none");
		card.classList.toggle("has-banner", Boolean(p.banner || p.accentColor));
		if (p.accentColor) card.style.setProperty("--banner-color", p.accentColor);
		else card.style.removeProperty("--banner-color");
	}
}

function renderHello(first: string) {
	const hello = $("hello");
	if (!hello || hello.dataset.name === first) return;
	hello.dataset.name = first;
	render(<>{[...`Hi, I'm ${first}!`].map((character, index) => <span style={`--i:${index}`}>{character === " " ? "\u00a0" : character}</span>)}</>, hello);
}

function renderFacts(p: Profile) {
	const list = $("facts");
	if (list) render(
		<>
			<dt>pronouns</dt><dd>{p.pronouns.join(" / ")}</dd>
			<dt>status</dt><dd>{p.statusEmoji?.startsWith("http") ? <img class="emoji" src={p.statusEmoji} alt="" /> : p.statusEmoji} {p.status || "no custom status"}</dd>
			{p.facts.map((fact) => <><dt>{fact.label}</dt><dd>{fact.value}</dd></>)}
		</>,
		list,
	);
}

function renderSocials(p: Profile) {
	const list = $("socials");
	if (!list) return;
	render(<>{p.socials.map((social) => <li><a class="btn" href={social.href} target="_blank" rel="noopener"><span class="label">{social.label}</span></a></li>)}</>, list);
}
