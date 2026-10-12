import type { CanonicalEntitySummary, CanonicalEntityType, EntityResolutionQueueItem } from "@remi/domain";

export interface CatalogName {
  name: string;
  mentions: number;
}

export interface CatalogEntity {
  id: string;
  displayName: string;
  entityType: CanonicalEntityType;
  /** Distinct observed names linked to this entity, most frequent first. */
  names: CatalogName[];
  mentions: number;
  files: number;
}

/**
 * The API has no endpoint that lists canonical entities, so the catalog is rebuilt from the
 * accepted truths that are currently linked to one, plus any full entity records a detail returned.
 */
export function buildCatalog(
  items: EntityResolutionQueueItem[],
  known: CanonicalEntitySummary[] = []
): CatalogEntity[] {
  const byId = new Map<string, { entity: CatalogEntity; names: Map<string, number>; files: Set<string> }>();

  const ensure = (id: string, displayName: string, entityType: CanonicalEntityType) => {
    const existing = byId.get(id);
    if (existing) {
      return existing;
    }
    const created = {
      entity: { id, displayName, entityType, names: [], mentions: 0, files: 0 },
      names: new Map<string, number>(),
      files: new Set<string>()
    };
    byId.set(id, created);
    return created;
  };

  for (const item of items) {
    const link = item.currentEntityLink;
    if (!link || !item.proposal.currentProposal) {
      continue;
    }
    const entry = ensure(link.canonicalEntityId, link.canonicalEntityDisplayName, link.canonicalEntityType);
    const name = item.proposal.proposedDisplayName;
    entry.names.set(name, (entry.names.get(name) ?? 0) + 1);
    entry.files.add(item.artifactBlobId);
    entry.entity.mentions += 1;
  }

  for (const entity of known) {
    const entry = ensure(entity.id, entity.displayName, entity.entityType);
    for (const alias of entity.aliases) {
      if (!entry.names.has(alias.aliasValue)) {
        entry.names.set(alias.aliasValue, 0);
      }
    }
  }

  return [...byId.values()]
    .map(({ entity, names, files }) => ({
      ...entity,
      names: [...names.entries()]
        .map(([name, mentions]) => ({ name, mentions }))
        .sort((a, b) => b.mentions - a.mentions || a.name.localeCompare(b.name)),
      files: files.size
    }))
    .sort((a, b) => b.mentions - a.mentions || a.displayName.localeCompare(b.displayName));
}
