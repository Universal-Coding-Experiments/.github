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
        "Accept": "application/vnd.github+json",
      },
    };
    if (GITHUB_TOKEN) {
      options.headers["Authorization"] = `Bearer ${GITHUB_TOKEN}`;
    }
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

const CATEGORY_MAP = {
  "ui": "🎨 UI/UX & Components",
  "game": "🎮 Interactive Games",
  "animation": "✨ Creative Animations",
  "utility": "🛠️ Tools & Utilities",
};

function formatRepoDeepCard(r) {
  const name = `<b>[${r.name}](${r.html_url})</b>`;
  const language = r.language ? `🏷️ <code>${r.language}</code>` : "";
  const license = r.license ? ` • ⚖️ <code>${r.license.spdx_id || r.license.name}</code>` : "";
  const starsBadge = r.stargazers_count > 0 ? ` <b>⭐ ${r.stargazers_count}</b>` : "";
  const desc = r.description ? (r.description.length > 100 ? r.description.slice(0, 97) + "..." : r.description) : "<i>No description provided.</i>";

  return `${name}${starsBadge}<br>${language}${license}<br>${desc}`;
}

function formatRepoCard(r) {
  const name = `<b>[${r.name}](${r.html_url})</b>`;
  const starsBadge = r.stargazers_count > 0 ? ` <b>⭐ ${r.stargazers_count}</b>` : "";
  const desc = r.description ? (r.description.length > 80 ? r.description.slice(0, 77) + "..." : r.description) : "<i>No description provided.</i>";

  return `${name}${starsBadge}<br>${desc}`;
}

function groupRepos(repos) {
  const groups = { misc: [] };
  repos.forEach(r => {
    let matched = false;
    if (r.topics) {
      for (const topic of r.topics) {
        if (CATEGORY_MAP[topic]) {
          if (!groups[topic]) groups[topic] = [];
          groups[topic].push(r);
          matched = true;
          break;
        }
      }
    }
    if (!matched) groups.misc.push(r);
  });
  return groups;
}

function generateTree(repos) {
  const groups = groupRepos(repos);
  const lines = [];

  for (const [key, title] of Object.entries(CATEGORY_MAP)) {
    if (groups[key]) {
      lines.push(`- **${title.split(" ").slice(1).join(" ")}**`);
      groups[key].forEach(r => {
        lines.push(`  - 📄 [${r.name}](${r.html_url})`);
      });
    }
  }

  if (groups.misc && groups.misc.length > 0) {
    lines.push(`- **Other Experiments**`);
    groups.misc.forEach(r => {
      lines.push(`  - 📄 [${r.name}](${r.html_url})`);
    });
  }

  return lines.join("\n") + "\n";
}

function generateGrid(repos, columns = 2, deep = false) {
  if (!repos || repos.length === 0) return "";

  const rows = [];
  for (let i = 0; i < repos.length; i += columns) {
    const chunk = repos.slice(i, i + columns);
    const cells = chunk.map(r => deep ? formatRepoDeepCard(r) : formatRepoCard(r));
    while (cells.length < columns) cells.push("");
    rows.push(`| ${cells.join(" | ")} |`);
  }

  const divider = `| ${new Array(columns).fill(":---").join(" | ")} |`;

  return ["", divider, ...rows, ""].join("\n");
}

function generateRecent(repos) {
  const recent = [...repos]
    .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
    .slice(0, 3);

  const headers = recent.map(r => `<b>[${r.name}](${r.html_url})</b>`);
  const details = recent.map(r => `<i>Updated ${formatTimeAgo(new Date(r.updated_at))}</i>`);

  return [
    "",
    `| ${headers.join(" | ")} |`,
    `| ${new Array(recent.length).fill(":---").join(" | ")} |`,
    `| ${details.join(" | ")} |`,
    "",
  ].join("\n");
}

function formatTimeAgo(date) {
  const diff = Math.floor((new Date() - date) / 1000);
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return date.toISOString().split("T")[0];
}

function generateStats(repos) {
  const totalStars = repos.reduce((sum, r) => sum + r.stargazers_count, 0);
  const totalForks = repos.reduce((sum, r) => sum + r.forks_count, 0);
  const totalWatchers = repos.reduce((sum, r) => sum + r.watchers_count, 0);
  const totalIssues = repos.reduce((sum, r) => sum + r.open_issues_count, 0);

  return [
    "",
    `| 📜 Repositories | ⭐ Total Stars | 🍴 Total Forks | 👁️ Watchers | 🐞 Issues |`,
    `| :--- | :--- | :--- | :--- | :--- |`,
    `| ${repos.length} | ${totalStars} | ${totalForks} | ${totalWatchers} | ${totalIssues} |`,
    "",
    `*Last updated: ${new Date().toISOString().split("T")[0]}*`,
    "",
  ].join("\n");
}

function generateFeatured(repos) {
  const featured = [...repos]
    .sort((a, b) => b.stargazers_count - a.stargazers_count)
    .slice(0, 4);

  return generateGrid(featured, 2, true);
}

function generateCategorized(repos) {
  const groups = groupRepos(repos);
  const sections = [];

  for (const [key, title] of Object.entries(CATEGORY_MAP)) {
    if (groups[key]) {
      sections.push(`<details>`);
      sections.push(`<summary><b>${title}</b> (${groups[key].length})</summary>\n`);
      sections.push(generateGrid(groups[key], 2));
      sections.push(`\n</details>`);
    }
  }

  if (groups.misc && groups.misc.length > 0) {
    sections.push(`<details>`);
    sections.push(`<summary><b>🔬 Other Experiments</b> (${groups.misc.length})</summary>\n`);
    sections.push(generateGrid(groups.misc, 2));
    sections.push(`\n</details>`);
  }

  return sections.join("\n") + "\n";
}

function replaceBetweenMarkers(content, startMarker, endMarker, replacement) {
  const start = content.indexOf(startMarker);
  const end = content.indexOf(endMarker);
  if (start === -1 || end === -1 || end < start) {
    console.warn(`Markers ${startMarker} not found, skipping.`);
    return content;
  }
  return content.slice(0, start + startMarker.length) + "\n" + replacement + content.slice(end);
}

async function main() {
  const readmePath = path.resolve(TARGET_README);
  if (!fs.existsSync(readmePath)) {
    console.error(`Target README not found: ${readmePath}`);
    return;
  }
  let raw = fs.readFileSync(readmePath, "utf8");

  const repos = await fetchAllRepos(ORG_NAME);

  raw = replaceBetweenMarkers(raw, "<!-- ORG-REPOS-TREE:START -->", "<!-- ORG-REPOS-TREE:END -->", generateTree(repos));
  raw = replaceBetweenMarkers(raw, "<!-- ORG-REPOS-STATS:START -->", "<!-- ORG-REPOS-STATS:END -->", generateStats(repos));
  raw = replaceBetweenMarkers(raw, "<!-- ORG-REPOS-RECENT:START -->", "<!-- ORG-REPOS-RECENT:END -->", generateRecent(repos));
  raw = replaceBetweenMarkers(raw, "<!-- ORG-REPOS-FEATURED:START -->", "<!-- ORG-REPOS-FEATURED:END -->", generateFeatured(repos));
  raw = replaceBetweenMarkers(raw, "<!-- ORG-REPOS-CATEGORIZED:START -->", "<!-- ORG-REPOS-CATEGORIZED:END -->", generateCategorized(repos));

  fs.writeFileSync(readmePath, raw, "utf8");
  console.log("README updated with Project Explorer and Deep View.");
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});