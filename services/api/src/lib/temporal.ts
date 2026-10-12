import { Client, Connection } from "@temporalio/client";

import { apiConfig } from "./config";

let clientPromise: Promise<Client> | null = null;

export async function getTemporalClient(): Promise<Client> {
  if (!clientPromise) {
    clientPromise = Connection.connect({
      address: apiConfig.temporal.address
    }).then(
      (connection) =>
        new Client({
          connection,
          namespace: apiConfig.temporal.namespace
        })
    );
  }

  return clientPromise;
}
