import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve("server");
const EXTENSIONS = [".ts", ".tsx"];

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return EXTENSIONS.includes(path.extname(entry.name)) ? [full] : [];
  });
}

function resolveImport(fromFile, specifier) {
  if (!specifier.startsWith(".")) return null;
  const base = path.resolve(path.dirname(fromFile), specifier);
  const candidates = [
    ...EXTENSIONS.map(ext => base + ext),
    ...EXTENSIONS.map(ext => path.join(base, `index${ext}`)),
  ];
  return candidates.find(candidate => fs.existsSync(candidate)) || null;
}

const files = walk(ROOT);
const graph = new Map(files.map(file => [file, []]));
const importRe = /(?:import|export)\s+(?:[^"']+?\s+from\s+)?["']([^"']+)["']/g;

for (const file of files) {
  const source = fs.readFileSync(file, "utf8");
  for (const match of source.matchAll(importRe)) {
    const resolved = resolveImport(file, match[1]);
    if (resolved && graph.has(resolved)) graph.get(file).push(resolved);
  }
}

const visiting = new Set();
const visited = new Set();
const stack = [];
const cycles = [];

function visit(node) {
  if (visiting.has(node)) {
    const index = stack.indexOf(node);
    cycles.push([...stack.slice(index), node]);
    return;
  }
  if (visited.has(node)) return;

  visiting.add(node);
  stack.push(node);
  for (const next of graph.get(node) || []) visit(next);
  stack.pop();
  visiting.delete(node);
  visited.add(node);
}

for (const file of files) visit(file);

if (cycles.length) {
  console.error("Circular server imports detected:");
  for (const cycle of cycles) {
    console.error(` - ${cycle.map(file => path.relative(process.cwd(), file)).join(" -> ")}`);
  }
  process.exit(1);
}

console.log(`No circular server imports found across ${files.length} files.`);
