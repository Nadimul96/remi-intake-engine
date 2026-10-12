import { namesMatch, nameTokens } from "../assets";
import type { AssetNameRole } from "../rules/asset-identity";

export interface AssetNameRecord {
  surface: string;
  identityName: string;
  role: AssetNameRole;
  /** Names read from a file name are weak evidence and never become the canonical name. */
  fromFileName: boolean;
  artifactBlobId: string;
}

export interface AssetClusters {
  /** Canonical asset name for any surface name seen in the corpus, or null when unknown. */
  canonicalOf(surface: string | null): string | null;
  clusters: { canonical: string; surfaces: string[] }[];
}

function keyOf(name: string): string {
  return nameTokens(name, { keepConnectors: true }).join(" ");
}

class UnionFind {
  private readonly parent = new Map<string, string>();

  find(node: string): string {
    const parent = this.parent.get(node) ?? node;
    if (parent === node) {
      this.parent.set(node, node);
      return node;
    }
    const root = this.find(parent);
    this.parent.set(node, root);
    return root;
  }

  union(left: string, right: string): void {
    const a = this.find(left);
    const b = this.find(right);
    if (a !== b) {
      this.parent.set(a, b);
    }
  }
}

/**
 * Group every asset name in the corpus into clusters that denote one property.
 *
 * Two kinds of evidence link names: a document stating that a variant refers to its
 * own asset (explicit link), and two documents' primary names matching under
 * `namesMatch`. A short name that matches two long names which do not match each
 * other ("Oakwood" vs "Oakwood Commons" and "Oakwood Terrace") is ambiguous and links
 * neither, so one shared word can never merge two properties.
 */
export function clusterAssetNames(records: AssetNameRecord[], extraNames: string[] = []): AssetClusters {
  const forest = new UnionFind();
  const display = new Map<string, string>();
  const remember = (name: string): string => {
    const key = keyOf(name);
    if (!display.has(key)) {
      display.set(key, name);
    }
    forest.find(key);
    return key;
  };

  for (const record of records) {
    const surface = remember(record.surface);
    const identity = remember(record.identityName);
    if (record.role !== "primary") {
      forest.union(surface, identity);
    }
  }

  const primaryNames = [
    ...new Set([
      ...records.filter((record) => record.role === "primary").map((record) => remember(record.surface)),
      ...extraNames.map(remember)
    ])
  ];
  const matchesOf = new Map(
    primaryNames.map((name) => [name, primaryNames.filter((other) => other !== name && namesMatch(name, other))])
  );
  const ambiguous = new Set(
    primaryNames.filter((name) => {
      const matches = matchesOf.get(name) ?? [];
      return matches.some((left) => matches.some((right) => left !== right && !namesMatch(left, right)));
    })
  );
  for (const [name, matches] of matchesOf) {
    for (const match of matches) {
      if (!ambiguous.has(name) && !ambiguous.has(match)) {
        forest.union(name, match);
      }
    }
  }

  const strength = new Map<string, number>();
  for (const record of records) {
    if (record.role === "primary" && !record.fromFileName) {
      const key = keyOf(record.surface);
      strength.set(key, (strength.get(key) ?? 0) + 1);
    }
  }

  const members = new Map<string, string[]>();
  for (const key of display.keys()) {
    const root = forest.find(key);
    members.set(root, [...(members.get(root) ?? []), key]);
  }

  const canonicalByRoot = new Map<string, string>();
  const clusters = [...members.entries()].map(([root, keys]) => {
    const best = [...keys].sort(
      (left, right) =>
        (strength.get(right) ?? 0) - (strength.get(left) ?? 0) ||
        right.split(" ").length - left.split(" ").length ||
        left.localeCompare(right)
    )[0];
    const canonical = display.get(best) ?? best;
    canonicalByRoot.set(root, canonical);
    return { canonical, surfaces: keys.map((key) => display.get(key) ?? key) };
  });

  return {
    canonicalOf(surface) {
      if (!surface) {
        return null;
      }
      const key = keyOf(surface);
      return display.has(key) ? (canonicalByRoot.get(forest.find(key)) ?? null) : null;
    },
    clusters
  };
}
