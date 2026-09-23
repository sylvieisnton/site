import { tickActivities } from "./client/activities";
import { fallbackContent, loadContent, renderContent } from "./client/content";
import { set } from "./client/dom";
import { playIntro } from "./client/intro";
import { fallbackProfile, firstName, loadProfile, renderProfile } from "./client/profile";
import { initSpotifyPreview, loadSpotify, tickSpotify } from "./client/spotify";

localStorage.removeItem("theme");

renderProfile(fallbackProfile);
renderContent(fallbackContent);
initSpotifyPreview();

const tick = () => {
	tickActivities();
	tickSpotify();
};
tick();
setInterval(tick, 1000);

playIntro(firstName(fallbackProfile));
loadProfile();
loadContent();
loadSpotify();
setInterval(loadProfile, 1000);
setInterval(loadContent, 1000);
setInterval(loadSpotify, 15000);

if ("EventSource" in window) {
	new EventSource("/api/events").addEventListener("config", () => {
		loadProfile();
		loadContent();
	});
}
