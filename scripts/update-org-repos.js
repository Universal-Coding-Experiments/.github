/**
 * Update the org repos section in profile/README.md by replacing content
 * between <!-- ORG-REPOS-LIST:START --> and <!-- ORG-REPOS-LIST:END -->
 */

const fs = require("fs");
const path = require("path");
const https = require("https");

const ORG_NAME = process.env.ORG_NAME || "Universal-Coding-Experiments";
const TARGET_README = process.env.TARGET_README || "profile/README.md";
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

async function fetchAllRepos(org) {
  const perPage = 100;
  let page = 1;
  let all = [];

  while (true) {
    const url = `https://api.github.com/orgs/${org}/repos?type=public&per_page=${perPage}&page=${page}&sort=updated`;
    const repos = await ghGet(url);
    if (!repos || repos.length === 0) break;
    all = all.concat(repos);
    if (repos.length < perPage) break;
    page++;
  }

  const EXCLUDE = [".github"];

  return all
    .filter(r => !r.archived && !EXCLUDE.includes(r.name))
    .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));

}

function ghGet(url) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        "User-Agent": "GitHub-Action",
        "Authorization": GITHUB_TOKEN ? `Bearer ${GITHUB_TOKEN}` : undefined,
        "Accept": "application/vnd.github+json",
      },
    };
    https
      .get(url, options, res => {
        let data = "";
        res.on("data", chunk => (data += chunk));
        res.on("end", () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(data));
            } catch (e) {
              reject(new Error("Failed to parse JSON"));
            }
          } else {
            console.error(`GitHub API error ${res.statusCode}: ${data}`);
            reject(new Error(`GitHub API error ${res.statusCode}`));
          }
        });
      })
      .on("error", reject);
  });
}

function formatRepoList(repos) {
  // Limit or remove limit as desired
  const limit = 30;
  const items = repos.slice(0, limit).map(r => {
    const description = r.description ? ` – ${r.description}` : "";
    const topics = r.topics && r.topics.length > 0 ? ` (${r.topics.join(", ")})` : "";
    return `- [${r.name}](${r.html_url})${description}${topics}`;
  });

  return [
    "",
    items.join("\n"),
    "",
    `> Showing ${Math.min(repos.length, limit)} of ${repos.length} public repositories. Last updated: ${new Date().toISOString().split("T")[0]}.`,
    "",
  ].join("\n");
}

function replaceBetweenMarkers(content, startMarker, endMarker, replacement) {
  const start = content.indexOf(startMarker);
  const end = content.indexOf(endMarker);
  if (start === -1 || end === -1 || end < start) {
    throw new Error("Markers not found or malformed in README");
  }
  return content.slice(0, start + startMarker.length) + "\n" + replacement + content.slice(end);
}

async function main() {
  const readmePath = path.resolve(TARGET_README);
  const raw = fs.readFileSync(readmePath, "utf8");

  const repos = await fetchAllRepos(ORG_NAME);
  const replacement = formatRepoList(repos);

  const updated = replaceBetweenMarkers(
    raw,
    "<!-- ORG-REPOS-LIST:START -->",
    "<!-- ORG-REPOS-LIST:END -->",
    replacement
  );

  if (updated.trim() !== raw.trim()) {
    fs.writeFileSync(readmePath, updated, "utf8");
    console.log("README updated with repository list.");
  } else {
    console.log("No changes detected.");
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});