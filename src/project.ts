import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";

export type ProjectInfo = { root: string; name: string; branch?: string };

function gitDirFor(root: string): string | null {
  const dotGit = join(root, ".git");
  try {
    if (statSync(dotGit).isDirectory()) return dotGit;
    const pointer = /^gitdir:\s*(.+)$/m.exec(readFileSync(dotGit, "utf8"))?.[1]?.trim();
    if (!pointer) return null;
    return isAbsolute(pointer) ? pointer : resolve(root, pointer);
  } catch {
    return null;
  }
}

export function findRepoRoot(start: string, stopAt?: string): string | null {
  let current = resolve(start);
  for (let depth = 0; depth < 64; depth += 1) {
    if (existsSync(join(current, ".git"))) return current;
    if (stopAt && resolve(current) === resolve(stopAt)) return null;
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
  return null;
}

export function branchFor(root: string): string | undefined {
  const gitDir = gitDirFor(root);
  if (!gitDir) return undefined;
  try {
    return /^ref:\s*refs\/heads\/(.+)$/.exec(readFileSync(join(gitDir, "HEAD"), "utf8").trim())?.[1];
  } catch {
    return undefined;
  }
}

export function projectForFile(file: string, workspaceFolder: string | undefined): ProjectInfo | null {
  const root = findRepoRoot(dirname(file)) ?? workspaceFolder ?? null;
  if (!root) return null;
  return { root, name: basename(root), branch: branchFor(root) };
}

export function relativeEntity(file: string, root: string): string | null {
  const inside = relative(root, file);
  if (!inside || inside.startsWith("..") || isAbsolute(inside)) return null;
  return inside.replace(/\\/g, "/");
}

export function extensionEntity(file: string): string {
  const name = basename(file);
  const dot = name.lastIndexOf(".");
  return dot > 0 ? `*${name.slice(dot).toLowerCase()}` : "*";
}

export function globToRegExp(glob: string): RegExp {
  let pattern = "";
  for (let index = 0; index < glob.length; index += 1) {
    const char = glob[index];
    if (char === "*" && glob[index + 1] === "*") {
      pattern += ".*";
      index += glob[index + 2] === "/" ? 2 : 1;
    } else if (char === "*") pattern += "[^/]*";
    else if (char === "?") pattern += "[^/]";
    else pattern += char.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${pattern}$`, "i");
}

export function isExcluded(path: string, patterns: string[]): boolean {
  const normal = path.replace(/\\/g, "/");
  return patterns.some((pattern) => globToRegExp(pattern).test(normal));
}
