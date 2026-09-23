import chalk from "chalk";

export function site(message: string) {
	console.log(chalk.hex("#00ff00")(`[site] ${message}`));
}

export function discord(message: string) {
	console.log(chalk.blue(`[discord] ${message}`));
}

export function github(message: string) {
	console.log(chalk.magenta(`[github] ${message}`));
}

export function spotify(message: string) {
	console.log(chalk.green(`[spotify] ${message}`));
}