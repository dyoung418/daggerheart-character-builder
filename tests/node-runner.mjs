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
//
// It reads a Buffer and decodes on demand, rather than reading "utf8" up front, because the
// files are not all text. data/sheet/sheet-template.pdf is 469,823 bytes of which 130,785 are
// above 0x7F, and decoding it as UTF-8 turns most of those into U+FFFD: re-encoding the decoded
// string gives 684,528 bytes, 214,705 more than the file has. So a stub that only offered text()
// could not hand shared/pdf-form.js a template it would accept, whatever the caller did with the
// string. arrayBuffer() is the other half: it is what sheet-pdf.js:63 actually calls, and with
// these two changes readForm() on the fetched bytes reads the real template's 182 widgets.
// (This does not retire the synthetic fixture at tests.js:5170 — that one is deliberate, and its
// own comment says why: a template we compose carries traps a real one only has by luck.)
//
// A missing file resolves as { ok: false, status: 404 } instead of throwing, matching what a
// server answers for a path that isn't there. That is what lets template-backed tests skip
// cleanly: data/sheet is a symlink into the private content repo (-> ~/daggerheart-content/sheet),
// so it is absent in CI and in any public clone, and the check is `if (!res.ok) skip` — the same
// shape sheet-pdf.js:62 uses. Only "not there" is translated, ENOENT and the ENOTDIR you get for
// a path that runs through a file; any other read error still throws, because a template that
// exists and cannot be read is a broken machine, not an uninstalled one.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const here = new URL(".", import.meta.url);
globalThis.fetch = async (url) => {
  const path = fileURLToPath(new URL(String(url).replace(/\?.*$/, ""), here));
  let buf;
  try {
    buf = await readFile(path);
  } catch (err) {
    if (err.code !== "ENOENT" && err.code !== "ENOTDIR") throw err;
    return { ok: false, status: 404, json: async () => null, text: async () => "", arrayBuffer: async () => new ArrayBuffer(0) };
  }
  return {
    ok: true,
    status: 200,
    json: async () => JSON.parse(buf.toString("utf8")),
    text: async () => buf.toString("utf8"),
    // Buffers come out of a shared pool, so buf.buffer is usually far larger than the file:
    // slice to this file's own window or the caller gets the neighbouring reads too.
    arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
  };
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
