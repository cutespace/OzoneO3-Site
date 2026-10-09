import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../public");
const errors = [];

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const item = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(item) : [item];
  });
}

function localTarget(href) {
  if (!href.startsWith("/") || href.startsWith("//")) return null;
  const pathname = new URL(href, "https://ozoneo3.pages.dev").pathname;
  return /\.[a-z0-9]+$/i.test(pathname)
    ? path.join(root, pathname)
    : path.join(root, pathname, "index.html");
}

const pages = walk(root).filter((file) => file.endsWith(".html"));
for (const file of pages) {
  const html = fs.readFileSync(file, "utf8");
  const rel = path.relative(root, file);
  if (/<meta name="robots" content="[^"]*noindex/i.test(html)) continue;
  if (!/<title>[^<]+<\/title>/.test(html) || !/<meta name="description" content="[^"]+">/.test(html) || !/<link rel="canonical" href="[^"]+">/.test(html)) {
    errors.push(`${rel}: missing title, description, or canonical`);
  }
  if (/\b(?:href|src)="undefined"/.test(html)) errors.push(`${rel}: undefined href or src`);
  const hreflangs = [...html.matchAll(/hreflang="([^"]+)"/g)].map((match) => match[1]);
  if (hreflangs.length && !["zh-CN", "en", "fr", "x-default"].every((lang) => hreflangs.includes(lang))) {
    errors.push(`${rel}: incomplete hreflang set`);
  }
  for (const match of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try { JSON.parse(match[1]); } catch (error) { errors.push(`${rel}: invalid JSON-LD: ${error.message}`); }
  }
  for (const match of html.matchAll(/<a\s[^>]*href="([^"]+)"/g)) {
    const target = localTarget(match[1]);
    if (target && !fs.existsSync(target)) errors.push(`${rel}: broken local link ${match[1]}`);
  }
  for (const match of html.matchAll(/<img\s[^>]*src="([^"]+)"/g)) {
    const target = localTarget(match[1]);
    if (target && !fs.existsSync(target)) errors.push(`${rel}: missing local image ${match[1]}`);
  }
}

const sitemap = fs.readFileSync(path.join(root, "sitemap.xml"), "utf8");
if (!sitemap.startsWith('<?xml version="1.0" encoding="UTF-8"?>')) {
  errors.push("sitemap: missing UTF-8 XML declaration or unexpected leading bytes");
}
if (!/<urlset\s+xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/.test(sitemap)) {
  errors.push("sitemap: missing standard urlset namespace");
}
const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
if (new Set(urls).size !== urls.length) errors.push("sitemap: duplicate URLs found");
for (const url of urls) {
  if (!url.startsWith("https://ozoneo3.pages.dev/")) errors.push(`sitemap: unexpected origin for ${url}`);
  const pathname = new URL(url).pathname;
  const target = pathname === "/" ? path.join(root, "index.html") : path.join(root, pathname, "index.html");
  if (!fs.existsSync(target)) errors.push(`sitemap: missing file for ${url}`);
}

const headers = fs.readFileSync(path.join(root, "_headers"), "utf8");
if (!/\/sitemap\.xml[\s\S]*Content-Type: application\/xml; charset=utf-8/.test(headers)) {
  errors.push("headers: sitemap.xml must be served as application/xml");
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(`Validated ${pages.length} HTML pages and ${urls.length} sitemap URLs.`);
