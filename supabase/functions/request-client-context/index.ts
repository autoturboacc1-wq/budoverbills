const jsonHeaders = {
  "Content-Type": "application/json",
};

function getClientIp(req: Request): string {
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const firstIp = forwardedFor.split(",")[0]?.trim();
    if (firstIp) {
      return firstIp;
    }
  }

  const realIp = req.headers.get("x-real-ip");
  if (realIp) {
    return realIp;
  }

  const flyClientIp = req.headers.get("fly-client-ip");
  if (flyClientIp) {
    return flyClientIp;
  }

  return "unknown";
}

Deno.serve((req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: jsonHeaders,
    });
  }

  return new Response(
    JSON.stringify({
      ip: getClientIp(req),
    }),
    {
      status: 200,
      headers: jsonHeaders,
    },
  );
});
