import { readFileSync } from "node:fs";

export const ownership = JSON.parse(
  readFileSync(new URL("../ownership.json", import.meta.url), "utf8"),
);

/** Owner of a repo-relative path: "tanbir" | "harshit" | "shared" | "any". Longest prefix wins. */
export function ownerOf(path) {
  let best = "";
  for (const prefix of Object.keys(ownership.paths)) {
    if (path.startsWith(prefix) && prefix.length >= best.length) best = prefix;
  }
  return ownership.paths[best];
}

export function personForBranch(branch) {
  for (const [id, p] of Object.entries(ownership.people)) {
    if (branch.startsWith(p.branchPrefix)) return id;
  }
  return null;
}
