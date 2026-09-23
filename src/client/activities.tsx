import type { Activity } from "../discord";
import { $, fmt, mount } from "./dom";

const verb: Record<Activity["type"], string> = {
	playing: "Playing",
	streaming: "Streaming",
	listening: "Listening to",
	watching: "Watching",
	competing: "Competing in",
};

function Activities({ list }: { list: Activity[] }) {
	if (!list.length) return <p class="muted small">not doing anything right now</p>;
	return (
		<>
			{list.map((activity) => (
				<div class="activity">
					<span class="act-art">
						{activity.image ? <img src={activity.image} alt="" /> : <span class="act-fallback">🎮</span>}
						{activity.smallImage ? <img class="act-small" src={activity.smallImage} alt="" /> : null}
					</span>
					<span class="act-info">
						<span class="act-verb">{verb[activity.type] ?? "Playing"}</span>
						<strong>{activity.name}</strong>
						{activity.details ? <span>{activity.details}</span> : null}
						{activity.state ? <span class="muted">{activity.state}</span> : null}
						{activity.type === "playing" && activity.start ? (
							<span class="act-time muted small" data-start={Number(activity.start)} />
						) : null}
					</span>
				</div>
			))}
		</>
	);
}

export function renderActivities(list: Activity[]) {
	const box = $("activity-list");
	if (!box) return;
	mount(<Activities list={list} />, box);
	tickActivities();
}

export function tickActivities() {
	document.querySelectorAll<HTMLElement>(".act-time[data-start]").forEach((el) => {
		el.textContent = `${fmt(Date.now() - Number(el.dataset.start))} elapsed`;
	});
}
