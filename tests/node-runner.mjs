// Runs tests/tests.js from the terminal: `node tests/node-runner.mjs`.
//
// The suite is written for the browser (tests/index.html) and only touches the DOM at the
// end, to print its report. This file stands in for that DOM with the smallest possible
// stub, imports the suite, and prints the same report as text. Exit code 1 on any failure,
// so it can gate a commit. Nothing in the app imports this file; deleting tests/ is still safe.

const nodes = [];
function element(tag) {
  const node = { tag, className: "", textContent: "", children: [] };
  node.appendChild = (child) => { node.children.push(child); return child; };
  node.append = (...kids) => kids.forEach(node.appendChild);
  return node;
}
const results = element("div");
const summary = element("div");
globalThis.document = {
  createElement: element,
  getElementById: (id) => (id === "results" ? results : id === "summary" ? summary : element("div")),
};

// The suite fetches a few data/ files with a relative URL, as the browser would from
// tests/index.html: resolve those against this directory and serve them from disk.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const here = new URL(".", import.meta.url);
globalThis.fetch = async (url) => {
  const path = fileURLToPath(new URL(String(url).replace(/\?.*$/, ""), here));
  const text = await readFile(path, "utf8");
  return { ok: true, json: async () => JSON.parse(text), text: async () => text };
};

await import(`./tests.js?run=${Date.now()}`);

for (const group of results.children) {
  const [heading, ...checks] = group.children;
  console.log(`\n${heading.textContent}`);
  for (const row of checks) {
    const [mark, label, detail] = row.children;
    console.log(`  ${mark.textContent} ${label.textContent}`);
    if (detail) console.log(detail.textContent.replace(/^/gm, "      "));
  }
}
console.log(`\n${summary.textContent}`);
process.exit(summary.className.includes("bad") ? 1 : 0);
