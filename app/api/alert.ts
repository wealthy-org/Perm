// api/alert.ts
export default async function handler(req: Request) {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const body = await req.json();
  console.log("Perm alert:", body.text);
  console.log("Report:", body.report);

  // Simpan ke database, kirim email, atau forward ke Slack — sesuai kebutuhan Anda

  return new Response("ok", { status: 200 });
}