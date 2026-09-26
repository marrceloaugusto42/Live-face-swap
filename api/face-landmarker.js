export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.statusCode = 405;
    res.setHeader("Allow", "GET");
    res.end("Method Not Allowed");
    return;
  }
  try {
    const upstream = await fetch("https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task");
    if (!upstream.ok || !upstream.body) {
      res.statusCode = 502;
      res.end("Face landmark model unavailable");
      return;
    }
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
    const buffer = Buffer.from(await upstream.arrayBuffer());
    res.end(buffer);
  } catch (error) {
    res.statusCode = 502;
    res.end("Could not fetch face landmark model");
  }
}
