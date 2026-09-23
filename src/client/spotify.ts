import type { SpotifyState } from "../spotify";
import { $, ago, fmt, load, set } from "./dom";

let sp: SpotifyState | null = null;
let currentTrackId = "";
const audio = () => $<HTMLAudioElement>("sp-audio");

export const loadSpotify = () => load("/api/spotify", renderSpotify);

export function renderSpotify(state: SpotifyState) {
	sp = state;
	const card = $("spotify");
	if (!card) return;
	if (!state.configured || !state.track) {
		card.hidden = true;
		return;
	}
	card.hidden = false;
	const t = state.track;

	set("spotify-label", state.playing ? "Listening now" : "Last played");
	card.classList.toggle("is-live", state.playing);

	if (t.id !== currentTrackId) {
		currentTrackId = t.id;
		const art = $<HTMLImageElement>("sp-art");
		if (art) art.src = t.art ?? "";
		set("sp-title", t.name);
		set("sp-artist", t.artists.map((a) => a.name).join(", "));
		set("sp-album", t.album);
		const link = $<HTMLAnchorElement>("sp-link");
		if (link) link.href = t.url;
		set("sp-duration", fmt(t.durationMs));

		const a = audio();
		if (a?.paused) {
			a.src = t.previewUrl ?? "";
			resetPreviewUi();
		}
	}
	set("sp-hint", t.previewUrl ? "click to preview" : "no preview available");
	$("sp-widget")?.classList.toggle("no-preview", !t.previewUrl);
	tickSpotify();
}

export function tickSpotify() {
	if (!sp?.configured || !sp.track) return;
	const bar = $("sp-bar");
	const wrap = $("sp-progress-wrap");
	if (sp.playing && sp.progressMs != null) {
		const pos = Math.min(sp.track.durationMs, sp.progressMs + (Date.now() - sp.fetchedAt));
		if (bar) bar.style.width = `${(pos / sp.track.durationMs) * 100}%`;
		set("sp-elapsed", fmt(pos));
		wrap?.classList.remove("idle");
	} else {
		if (bar) bar.style.width = "0%";
		set("sp-elapsed", sp.playedAt ? ago(sp.playedAt) : "");
		wrap?.classList.add("idle");
	}
}

function resetPreviewUi() {
	set("sp-play", "▶");
	$("sp-widget")?.classList.remove("previewing");
	const ring = $("sp-ring");
	if (ring) ring.style.strokeDashoffset = "100";
}

const previewSrc = () =>
	sp?.configured && sp.track?.previewUrl ? new URL(sp.track.previewUrl, location.href).href : null;

export function initSpotifyPreview() {
	const a = audio();
	if (!a) return;

	$("sp-widget")?.addEventListener("click", async () => {
		const src = previewSrc();
		if (!src) return;
		if (!a.paused) return a.pause();
		if (a.src !== src) a.src = src;
		a.volume = 0.5;
		try {
			await a.play();
		} catch {
			set("sp-hint", "couldn't play preview");
		}
	});

	a.addEventListener("play", () => {
		set("sp-play", "❚❚");
		$("sp-widget")?.classList.add("previewing");
		set("sp-hint", "previewing... click to stop");
	});
	a.addEventListener("pause", () => {
		resetPreviewUi();
		set("sp-hint", "click to preview");
	});
	a.addEventListener("ended", () => {
		a.currentTime = 0;
		const src = previewSrc();
		if (src && a.src !== src) a.src = src;
	});
	a.addEventListener("timeupdate", () => {
		const ring = $("sp-ring");
		if (ring && a.duration) ring.style.strokeDashoffset = String(100 - (a.currentTime / a.duration) * 100);
	});
}
