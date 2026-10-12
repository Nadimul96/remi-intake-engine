import type { IntakeDetail as IntakeDetailData } from "@remi/domain";
import { AlertTriangle } from "lucide-react";
import type { ReactElement, ReactNode } from "react";

import { formatBytes, formatDateTime, humanize } from "../../lib/format";
import { Badge, statusTone } from "../ui/badge";
import { Card } from "../ui/card";
import { AnchorSummary } from "./anchor-summary";
import { CandidateSection } from "./candidate-section";
import { IntakeTimeline } from "./intake-timeline";
import { isInFlight, kindLabel, PARSER_LABEL, STAGE_LABEL } from "./labels";
import { NormalizationSection } from "./normalization-section";
import { PipelineSteps } from "./pipeline-steps";
import { Section } from "./section";

function Fact({ label, children, mono }: { label: string; children: ReactNode; mono?: boolean }): ReactElement {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={mono ? "mt-0.5 truncate font-mono text-xs leading-5 text-fg" : "mt-0.5 truncate text-sm text-fg"}>
        {children}
      </dd>
    </div>
  );
}

function yesNo(value: boolean | null): string {
  if (value === null) {
    return "Not assessed";
  }
  return value ? "Yes" : "No";
}

function FailureNotice({ detail }: { detail: IntakeDetailData }): ReactElement | null {
  const failure = [...detail.timeline].reverse().find((event) => event.eventType.endsWith("_failed"));
  if (!failure && detail.status !== "failed") {
    return null;
  }
  const reason = failure?.payload.errorMessage ?? failure?.payload.error ?? failure?.payload.message;
  return (
    <div className="flex items-start gap-2.5 rounded-lg bg-danger-soft px-3 py-2.5 text-sm text-danger-text">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0">
        <p className="font-medium">{failure?.message ?? "Ingestion failed"}</p>
        {typeof reason === "string" ? <p className="mt-0.5 break-words opacity-80">{reason}</p> : null}
      </div>
    </div>
  );
}

function DetailHeader({ detail }: { detail: IntakeDetailData }): ReactElement {
  const moving = isInFlight(detail);
  return (
    <div className="space-y-4 px-4 py-4 sm:px-5">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={statusTone(detail.status)}>{humanize(detail.status)}</Badge>
          {moving ? <Badge tone="info">{STAGE_LABEL[detail.ingestionStage]}</Badge> : null}
          {detail.supportTier ? (
            <Badge tone={statusTone(detail.supportTier)}>{humanize(detail.supportTier)}</Badge>
          ) : null}
          {detail.parserTarget ? <Badge>{PARSER_LABEL[detail.parserTarget]} parser</Badge> : null}
          {detail.fileClassification ? <Badge>{kindLabel(detail.fileClassification)}</Badge> : null}
        </div>
        <h2 className="text-lg font-semibold tracking-tight break-all text-fg">{detail.fileName}</h2>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
        <Fact label="Size">{formatBytes(detail.sizeBytes)}</Fact>
        <Fact label="Content type">
          <span title={detail.contentType ?? undefined}>{detail.contentType ?? "Unknown"}</span>
        </Fact>
        <Fact label="Source">
          <span title={humanize(detail.sourceConnectionKind)}>{detail.sourceConnectionName}</span>
        </Fact>
        <Fact label="Registered">{formatDateTime(detail.createdAt)}</Fact>
      </dl>
      <PipelineSteps detail={detail} />
      <FailureNotice detail={detail} />
    </div>
  );
}

function ArtifactSection({ detail }: { detail: IntakeDetailData }): ReactElement {
  return (
    <Section title="Artifact">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
        <Fact label="Classification">{kindLabel(detail.fileClassification ?? "pending")}</Fact>
        <Fact label="Extension">{detail.normalizedExtension ? `.${detail.normalizedExtension}` : "Unknown"}</Fact>
        <Fact label="Parser eligible">{detail.parserEligible ? "Yes" : "No"}</Fact>
        <Fact label="Native text">{yesNo(detail.nativeTextPresent)}</Fact>
        <Fact label="OCR needed later">{yesNo(detail.ocrNeededLater)}</Fact>
        <Fact label="Container">{yesNo(detail.isContainer)}</Fact>
      </dl>
      <dl className="grid gap-3 rounded-lg border border-border bg-surface px-3 py-2.5">
        <Fact label="SHA-256" mono>
          <span title={detail.artifactSha256 ?? undefined}>{detail.artifactSha256 ?? "Pending"}</span>
        </Fact>
        <Fact label="Immutable key" mono>
          <span title={detail.immutableStorageKey ?? undefined}>{detail.immutableStorageKey ?? "Pending"}</span>
        </Fact>
        <Fact label="Source URI" mono>
          <span title={detail.sourceUri}>{detail.sourceUri}</span>
        </Fact>
      </dl>
      {detail.derivedArtifacts.length > 0 ? (
        <div className="space-y-1.5">
          <h4 className="text-xs text-muted">Derived artifacts · {detail.derivedArtifacts.length}</h4>
          <div className="flex flex-wrap gap-1.5">
            {detail.derivedArtifacts.map((artifact) => (
              <span
                key={artifact.id}
                title={artifact.storageKey}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2 py-1 text-xs text-fg"
              >
                {humanize(artifact.kind)}
                <span className="text-faint">v{artifact.version}</span>
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </Section>
  );
}

export function IntakeDetail({ detail }: { detail: IntakeDetailData }): ReactElement {
  return (
    <Card className="overflow-hidden">
      <DetailHeader detail={detail} />
      <NormalizationSection detail={detail} />
      <Section title={`Provenance anchors · ${detail.provenanceAnchors.totalCount}`}>
        <AnchorSummary anchors={detail.provenanceAnchors} />
      </Section>
      <CandidateSection result={detail.candidateExtractionResult} candidates={detail.candidateSignals} />
      <ArtifactSection detail={detail} />
      <Section title={`Timeline · ${detail.timeline.length} events`}>
        <IntakeTimeline events={detail.timeline} />
      </Section>
    </Card>
  );
}
