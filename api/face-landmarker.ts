const MODEL_URL="https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "GET") {
    return new Response("Method Not Allowed", { status: 405, headers: { Allow: "GET" } });
  }
  try {
    const upstream=await fetch(MODEL_URL, {
      headers: { "User-Agent": "LiveFace/1.0" },
      cache: "no-store"
    });
    if (!upstream.ok || !upstream.body) {
      return new Response("Face landmark model unavailable", { status: 502 });
    }
    return new Response(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream",
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800"
      }
    });
  } catch {
    return new Response("Could not fetch face landmark model", { status: 502 });
  }
}
