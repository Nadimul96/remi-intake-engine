import type { SourceConnectionKind } from "@remi/domain";

export interface ConnectorDescriptor {
  key: string;
  kind: SourceConnectionKind;
  name: string;
  mutable: boolean;
}

export const intakeConnectors: ConnectorDescriptor[] = [
  {
    key: "local-upload",
    kind: "upload",
    name: "Local Upload",
    mutable: false
  },
  {
    key: "mailbox",
    kind: "mailbox",
    name: "Mailbox",
    mutable: true
  },
  {
    key: "file-drop",
    kind: "file_drop",
    name: "File Drop",
    mutable: true
  },
  {
    key: "sftp",
    kind: "sftp",
    name: "SFTP",
    mutable: true
  }
];
