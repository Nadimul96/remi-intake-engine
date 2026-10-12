import type {
  AssetOrganizationRelationshipQueueItem,
  DealScreeningWorkbench,
  EntityResolutionQueueItem
} from "@remi/domain";
import { ArrowUpRight, Link2, Network } from "lucide-react";
import Link from "next/link";
import type { ReactElement } from "react";

import { cn } from "../../lib/cn";
import { formatCandidateValue, formatPercent, humanize } from "../../lib/format";
import { Badge, statusTone } from "../ui/badge";
import { Card, CardHeader } from "../ui/card";
import { EmptyState } from "../ui/states";
import { Table, Td, Th, Tr } from "../ui/table";

function LaneLink({ href, children }: { href: string; children: string }): ReactElement {
  return (
    <Link href={href} className="inline-flex items-center gap-1 text-xs font-medium text-accent-text hover:underline">
      {children} <ArrowUpRight className="size-3" />
    </Link>
  );
}

function EntityRow({ item }: { item: EntityResolutionQueueItem }): ReactElement {
  const { proposal, currentEntityLink } = item;
  return (
    <Tr className={cn(!proposal.currentProposal && "opacity-60")}>
      <Td className="hidden sm:table-cell">
        <Badge tone={proposal.entityType === "asset" ? "accent" : "info"}>{humanize(proposal.entityType)}</Badge>
      </Td>
      <Td className="max-w-[14rem]">
        <span className="block truncate font-medium" title={formatCandidateValue(item.acceptedValue)}>
          {formatCandidateValue(item.acceptedValue)}
        </span>
        <span className="block truncate text-xs text-faint">
          {humanize(item.acceptedFieldName.replace(/^probable_/, ""))}
        </span>
      </Td>
      <Td className="max-w-[18rem]">
        {currentEntityLink ? (
          <span className="block truncate text-fg">{currentEntityLink.canonicalEntityDisplayName}</span>
        ) : (
          <span className="block truncate text-muted" title={proposal.statusExplanation}>
            {proposal.statusExplanation}
          </span>
        )}
        <span className="block truncate text-xs text-faint">
          {humanize(proposal.proposalKind)} · {formatPercent(proposal.confidence)} confidence
        </span>
      </Td>
      <Td>
        <Badge tone={statusTone(proposal.proposalState)}>{humanize(proposal.proposalState)}</Badge>
      </Td>
    </Tr>
  );
}

function EntityLinksCard({ items }: { items: EntityResolutionQueueItem[] }): ReactElement {
  const linked = items.filter((item) => item.currentEntityLink).length;
  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Entity links"
        description={`${linked} of ${items.length} accepted names linked to a canonical asset or organization`}
        actions={<LaneLink href="/entities">Reconcile</LaneLink>}
      />
      {items.length === 0 ? (
        <EmptyState
          className="py-8"
          icon={Link2}
          title="No identity proposals"
          description="Proposals appear once an asset or organization name from this document is accepted as truth."
        />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th className="hidden sm:table-cell">Type</Th>
              <Th>Accepted name</Th>
              <Th>Canonical entity</Th>
              <Th>Proposal</Th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <EntityRow key={item.proposal.id} item={item} />
            ))}
          </tbody>
        </Table>
      )}
    </Card>
  );
}

function RelationshipRow({
  item,
  historical
}: {
  item: AssetOrganizationRelationshipQueueItem;
  historical: boolean;
}): ReactElement {
  const { proposal, currentRelationshipLink: link } = item;
  const asset = link?.canonicalAssetDisplayName ?? proposal.assetEntityDisplayName;
  const organization = link?.canonicalOrganizationDisplayName ?? proposal.organizationEntityDisplayName;
  return (
    <Tr className={cn(historical && "opacity-60")}>
      <Td className="max-w-[12rem]">
        <span className="block truncate font-medium">{humanize(proposal.relationshipType)}</span>
        <span className="block text-xs text-faint">{historical ? "Historical" : "Current"}</span>
      </Td>
      <Td className="max-w-[18rem]">
        <span className="block truncate">
          {asset ?? <span className="text-muted">Unknown asset</span>}
          <span className="px-1.5 text-faint">→</span>
          {organization ?? <span className="text-muted">Unknown organization</span>}
        </span>
        <span className="block truncate text-xs text-faint" title={proposal.statusExplanation}>
          {link ? "Linked" : proposal.statusExplanation}
        </span>
      </Td>
      <Td>
        <Badge tone={proposal.resolutionReadiness === "ready_to_attach" ? "success" : "warning"}>
          {humanize(proposal.resolutionReadiness)}
        </Badge>
      </Td>
      <Td>
        <Badge tone={statusTone(proposal.proposalState)}>{humanize(proposal.proposalState)}</Badge>
      </Td>
    </Tr>
  );
}

function RelationshipsCard({
  relationships
}: {
  relationships: DealScreeningWorkbench["relationships"];
}): ReactElement {
  const { currentItems, historicalItems } = relationships;
  const total = currentItems.length + historicalItems.length;
  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Relationships"
        description={`${currentItems.length} current · ${historicalItems.length} historical asset-organization assertions`}
        actions={<LaneLink href="/relationships">Review</LaneLink>}
      />
      {total === 0 ? (
        <EmptyState
          className="py-8"
          icon={Network}
          title="No relationship assertions"
          description="Broker or originator links appear when this document names an organization alongside an asset."
        />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Relationship</Th>
              <Th>Asset → organization</Th>
              <Th>Readiness</Th>
              <Th>Proposal</Th>
            </tr>
          </thead>
          <tbody>
            {currentItems.map((item) => (
              <RelationshipRow key={item.proposal.id} item={item} historical={false} />
            ))}
            {historicalItems.map((item) => (
              <RelationshipRow key={item.proposal.id} item={item} historical />
            ))}
          </tbody>
        </Table>
      )}
    </Card>
  );
}

export function IdentityTables({ workbench }: { workbench: DealScreeningWorkbench }): ReactElement {
  const { assetItems, organizationItems } = workbench.entityResolution;
  return (
    <div className="grid gap-4">
      <EntityLinksCard items={[...assetItems, ...organizationItems]} />
      <RelationshipsCard relationships={workbench.relationships} />
    </div>
  );
}
