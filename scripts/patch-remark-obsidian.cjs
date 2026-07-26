const fs = require("node:fs");
const path = require("node:path");

const packagePath = path.join(
	__dirname,
	"..",
	"node_modules",
	"@quartz-community",
	"remark-obsidian",
	"package.json",
);

if (!fs.existsSync(packagePath)) {
	process.exit(0);
}

const raw = fs.readFileSync(packagePath, "utf8");
const pkg = JSON.parse(raw);

if (!pkg.exports || !pkg.exports["."]) {
	process.exit(0);
}

const exportEntry = pkg.exports["."];

if (exportEntry.require) {
	process.exit(0);
}

pkg.exports["."] = {
	...exportEntry,
	require: exportEntry.import || "./dist/index.js",
};

fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + "\n");
