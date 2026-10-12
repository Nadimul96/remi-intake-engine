function resolveDevelopmentApiBaseUrl(): string {
  return "http://127.0.0.1:4001";
}

export function getApiBaseUrl(): string {
  const configured = process.env.API_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL;

  if (configured) {
    return configured;
  }

  if (process.env.NODE_ENV !== "production") {
    return resolveDevelopmentApiBaseUrl();
  }

  throw new Error("API_BASE_URL or NEXT_PUBLIC_API_BASE_URL must be set for the console app.");
}
