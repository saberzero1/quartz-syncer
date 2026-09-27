/** Default publish title, inspired by Dom's dated Raycast garden commits.
 * Use the device's local clock on both desktop and mobile; UTC can show tomorrow.
 */
export function createPublishCommitMessage(date = new Date()): string {
	const pad = (value: number) => String(value).padStart(2, "0");
	const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
	const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
	const zone = new Intl.DateTimeFormat("en-US", { timeZoneName: "short" })
		.formatToParts(date)
		.find((part) => part.type === "timeZoneName")?.value;
	return `✨ 🌱 A little garden growth · ${day} ${time}${zone ? ` ${zone}` : ""}`;
}
