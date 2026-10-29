// Solo para aceptar visualmente /login en el build local, sin Supabase real.
import { createServer } from "node:http";

const requests: { method: string | undefined; path: string | undefined }[] = [];

createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "http://127.0.0.1:4233");
  res.setHeader("Access-Control-Allow-Headers", "authorization,apikey,content-type,x-client-info,x-supabase-api-version");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Content-Type", "application/json");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }
  if (req.url === "/qa/state") {
    res.end(JSON.stringify(requests));
    return;
  }
  // No guarda cuerpos, contraseñas ni credenciales.
  requests.push({ method: req.method, path: req.url });
  if (req.url?.startsWith("/auth/v1/token")) {
    setTimeout(() => {
      res.writeHead(400);
      res.end(JSON.stringify({ error_code: "invalid_credentials", message: "Invalid login credentials" }));
    }, 8000);
    return;
  }
  if (req.url === "/auth/v1/signup") {
    res.end(JSON.stringify({ id: "00000000-0000-4000-8000-000000000014", email: "a14-qa@example.test", aud: "authenticated", identities: [] }));
    return;
  }
  res.writeHead(404);
  res.end("{}");
}).listen(4234, "127.0.0.1", () => console.log("Auth ficticia A14 lista en 4234."));
