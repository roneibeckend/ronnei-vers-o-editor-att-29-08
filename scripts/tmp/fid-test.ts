import { getFidelizeConfig, fidelizeRequest, resolveFidelizePath } from "../../src/lib/fidelize.server";
const cfg = await getFidelizeConfig();
if (!cfg) { console.log("NO CONFIG"); process.exit(1); }
console.log("baseUrl:", cfg.baseUrl, "status:", cfg.status, "keyLen:", cfg.apiKey.length);
const p = (n: string) => resolveFidelizePath(cfg.baseUrl, n);
const email = `homolog.ronnei.${Date.now()}@example.com`;
const out: any = {};
out.health = await fidelizeRequest(p("/health"), { config: cfg });
out.ping = await fidelizeRequest(p("/ping-auth"), { config: cfg });
out.provision = await fidelizeRequest(p("/provision-account"), { config: cfg, method: "POST", body: { name: "Homologacao Ronnei", email, phone: "11999999999", plan: "starter", source: "ronnei" } });
out.magic = await fidelizeRequest(p("/magic-link"), { config: cfg, method: "POST", body: { email, source: "ronnei" } });
for (const [k, v] of Object.entries<any>(out)) {
  console.log("\n===", k, v.method, v.endpoint, "HTTP", v.httpCode, v.durationMs + "ms", v.success ? "OK" : "FAIL");
  console.log((v.rawBody || v.error || "").slice(0, 900));
}
