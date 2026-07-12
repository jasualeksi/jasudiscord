const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const publicDir = path.join(root, "public");
const imageExtensions = new Set([".gif", ".jpeg", ".jpg", ".png", ".webp"]);

const groups = {
  banners: "banners",
  logos: "logot",
  avatars: "profiilikuvat"
};

function titleFromFilename(filename) {
  const name = path.basename(filename, path.extname(filename));
  return name
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function naturalCompare(left, right) {
  return left.localeCompare(right, "fi", {
    numeric: true,
    sensitivity: "base"
  });
}

function getImages(folder) {
  const directory = path.join(publicDir, "assets", folder);

  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }

  return fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((filename) => imageExtensions.has(path.extname(filename).toLowerCase()))
    .sort(naturalCompare)
    .map((filename) => ({
      title: titleFromFilename(filename),
      src: `/assets/${folder}/${encodeURIComponent(filename).replaceAll("%2F", "/")}`
    }));
}

const manifest = Object.fromEntries(
  Object.entries(groups).map(([key, folder]) => [key, getImages(folder)])
);

fs.writeFileSync(
  path.join(publicDir, "portfolio-assets.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
  "utf8"
);

console.log(
  `Portfolio päivitetty: ${manifest.banners.length} banneria, ${manifest.logos.length} logoa, ${manifest.avatars.length} profiilikuvaa.`
);
