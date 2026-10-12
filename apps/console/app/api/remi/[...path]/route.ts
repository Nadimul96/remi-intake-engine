import { apiBaseUrl } from "../../../../lib/api";

/** Same-origin proxy from the browser to the API, so the browser never needs the API's address. */
async function forward(request: Request, context: { params: Promise<{ path: string[] }> }): Promise<Response> {
  const { path } = await context.params;
  const search = new URL(request.url).search;
  const target = `${apiBaseUrl()}/api/${path.map(encodeURIComponent).join("/")}${search}`;
  try {
    const upstream = await fetch(target, {
      method: request.method,
      headers: { "content-type": request.headers.get("content-type") ?? "application/json" },
      body: request.method === "GET" ? undefined : await request.text(),
      cache: "no-store"
    });
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" }
    });
  } catch {
    return Response.json({ error: "The API is not reachable." }, { status: 502 });
  }
}

export { forward as GET, forward as POST };
