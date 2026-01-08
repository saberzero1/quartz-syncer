import { getAPI } from "obsidian-dataview";
import { escapeRegExp } from "src/utils/utils";

export function hasDynamicContent(text: string): boolean {
	if (/```dataview\s/ms.test(text)) return true;

	if (/```datacorejs\s/ms.test(text)) return true;

	if (/```datacorejsx\s/ms.test(text)) return true;

	if (/```datacorets\s/ms.test(text)) return true;

	if (/```datacoretsx\s/ms.test(text)) return true;

	const dvApi = getAPI();

	if (dvApi) {
		const dataviewJsPrefix = dvApi.settings.dataviewJsKeyword;

		const dataViewJsRegex = new RegExp(
			"```" + escapeRegExp(dataviewJsPrefix) + "\\s",
			"ms",
		);

		if (dataViewJsRegex.test(text)) return true;

		const inlineQueryPrefix = dvApi.settings.inlineQueryPrefix;

		const inlineDataViewRegex = new RegExp(
			"`" + escapeRegExp(inlineQueryPrefix) + ".+?`",
			"ms",
		);

		if (inlineDataViewRegex.test(text)) return true;

		const inlineJsQueryPrefix = dvApi.settings.inlineJsQueryPrefix;

		const inlineJsDataViewRegex = new RegExp(
			"`" + escapeRegExp(inlineJsQueryPrefix) + ".+?`",
			"ms",
		);

		if (inlineJsDataViewRegex.test(text)) return true;
	}

	return false;
}
