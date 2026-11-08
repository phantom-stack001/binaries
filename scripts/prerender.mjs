import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, "../dist");
const templatePath = path.join(distDir, "index.html");

const { render } = await import(pathToFileURL(path.join(distDir, "server/entry-server.js")).href);

const routes = ["/", "/privacy/", "/terms/", "/login/", "/app/"];
const template = fs.readFileSync(templatePath, "utf8");

const APP_NAME = "Binaries.nl";
const APP_TAGLINE = "Email, Organized.";
const APP_COMPANY = "Binaries.nl";
const siteOrigin = (process.env.VITE_APP_URL ?? "").replace(/\/+$/, "");

const headByRoute = {
  "/": {
    title: `${APP_NAME} | ${APP_TAGLINE}`,
    description:
      "A modern email management platform for composition, contacts, campaigns, and accountable delivery operations.",
    canonicalPath: "/",
  },
  "/privacy/": {
    title: `Privacy Policy | ${APP_NAME}`,
    description: "How this service collects, uses, and protects information.",
    canonicalPath: "/privacy/",
  },
  "/terms/": {
    title: `Terms of Service | ${APP_NAME}`,
    description: "Terms governing use of this website and related services.",
    canonicalPath: "/terms/",
  },
  "/login/": {
    title: `Sign in | ${APP_NAME}`,
    description: `Sign in to the ${APP_NAME} workspace by ${APP_COMPANY}.`,
    canonicalPath: "/login/",
  },
  "/app/": {
    title: `Dashboard | ${APP_NAME}`,
    description: `${APP_NAME} dashboard overview.`,
    canonicalPath: "/app/",
  },
};

function buildHeadTags(meta) {
  const canonical = siteOrigin ? `${siteOrigin}${meta.canonicalPath}` : meta.canonicalPath;
  return [
    `<title>${meta.title}</title>`,
    `<meta name="description" content="${meta.description}" />`,
    `<link rel="canonical" href="${canonical}" />`,
  ].join("");
}

for (const url of routes) {
  const { appHtml, headHtml } = await render(url);
  const metaHead = buildHeadTags(headByRoute[url]);
  const mergedHead = headHtml ? `${metaHead}${headHtml}` : metaHead;

  const html = template
    .replace('<div id="root"></div>', `<div id="root">${appHtml}</div>`)
    .replace("</head>", `    ${mergedHead}\n  </head>`);

  if (url === "/") {
    fs.writeFileSync(templatePath, html);
    continue;
  }

  const outDir = path.join(distDir, url.slice(1));
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "index.html"), html);
}

console.log(`Prerendered ${routes.length} public routes.`);
