export async function GET(): Promise<Response> {
  return Response.json({
    service: "remi-console",
    status: "ok"
  });
}
