import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const jsRoot = path.join(root, "js");

function walk(directory, extensions) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".git") return [];
      return walk(target, extensions);
    }
    return extensions.has(path.extname(entry.name)) ? [target] : [];
  });
}

const modules = walk(jsRoot, new Set([".js", ".mjs"]));
const moduleSet = new Set(modules);
const graph = new Map();
const importPattern = /(?:import|export)\s+(?:[^"']*?\s+from\s+)?["']([^"']+)["']/g;

for (const file of modules) {
  const source = fs.readFileSync(file, "utf8");
  assert(!/Object\.(?:assign|defineProperty)\(globalThis|globalThis\.[\w$]+\s*=/.test(source), `${path.relative(root, file)} exposes a production global.`);
  const dependencies = [];
  for (const match of source.matchAll(importPattern)) {
    if (!match[1].startsWith(".")) continue;
    const dependency = path.resolve(path.dirname(file), match[1]);
    assert(moduleSet.has(dependency), `${path.relative(root, file)} imports missing module ${match[1]}.`);
    dependencies.push(dependency);
  }
  graph.set(file, dependencies);
}

const visiting = new Set();
const visited = new Set();
function visit(file, trail = []) {
  if (visiting.has(file)) {
    const cycleStart = trail.indexOf(file);
    const cycle = [...trail.slice(cycleStart), file].map((item) => path.relative(root, item)).join(" -> ");
    assert.fail(`Circular module dependency: ${cycle}`);
  }
  if (visited.has(file)) return;
  visiting.add(file);
  for (const dependency of graph.get(file) || []) visit(dependency, [...trail, file]);
  visiting.delete(file);
  visited.add(file);
}
for (const file of modules) visit(file);

assert(!fs.existsSync(path.join(root, "app.js")), "Legacy app.js compatibility entry still exists.");
assert(!fs.existsSync(path.join(jsRoot, "domain", "install.mjs")), "Legacy domain installer still exists.");

for (const htmlFile of walk(root, new Set([".html"]))) {
  const html = fs.readFileSync(htmlFile, "utf8");
  for (const script of html.matchAll(/<script\b([^>]*)\bsrc=["'][^"']+["'][^>]*>/g)) {
    assert(/\btype=["']module["']/.test(script[1]), `${path.relative(root, htmlFile)} loads a non-module external script.`);
  }
}

console.log(`Module architecture tests passed (${modules.length} modules, 0 cycles).`);
