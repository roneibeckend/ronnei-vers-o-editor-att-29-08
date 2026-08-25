/**
 * Template administrativo premium (React Email).
 * Uso interno: relatórios executivos enviados aos administradores.
 * Estilo dashboard / data-driven, responsivo e compatível com Resend.
 */
import {
  Body,
  Column,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Row,
  Section,
  Text,
} from "@react-email/components";
import { BRAND, EMAIL_ASSETS } from "@/emails/layout";

const C = {
  black: "#0B0B0B",
  orange: "#C24A00",
  white: "#FFFFFF",
  green: "#15803D",
  red: "#B91C1C",
  yellow: "#B45309",
  surface: "#F6F6F7",
  border: "#E4E4E7",
  muted: "#52525B",
  text: "#18181B",
  page: "#EEEEF1",
};

const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,Helvetica,sans-serif";

export interface AdminReportKpi {
  label: string;
  icon: string;
  value: string;
  delta?: number | null;
}

export interface AdminReportRow {
  label: string;
  value: string;
}

export interface AdminReportAlert {
  level: "critical" | "warning" | "ok";
  title: string;
  detail?: string;
}

export interface AdminReportEmailProps {
  reportType: string;
  reportDate: string;
  generatedAt: string;
  environment: string;
  kpis: AdminReportKpi[];
  financial: AdminReportRow[];
  users: AdminReportRow[];
  content: AdminReportRow[];
  alerts: AdminReportAlert[];
  links: { dashboard: string; financial: string; users: string; affiliates: string };
  previewText: string;
}

const alertColor = (level: AdminReportAlert["level"]) =>
  level === "critical" ? C.red : level === "warning" ? C.yellow : C.green;

function DeltaBadge({ delta }: { delta?: number | null }) {
  if (delta === null || delta === undefined || !Number.isFinite(delta)) {
    return (
      <Text style={{ margin: "6px 0 0", fontSize: "11px", color: C.muted, fontFamily: FONT }}>
        — sem base anterior
      </Text>
    );
  }
  const up = delta >= 0;
  return (
    <Text
      style={{
        margin: "6px 0 0",
        fontSize: "12px",
        fontWeight: 700,
        color: up ? C.green : C.red,
        fontFamily: FONT,
      }}
    >
      {up ? "▲" : "▼"} {Math.abs(delta).toFixed(1)}% vs. dia anterior
    </Text>
  );
}

function KpiCard({ kpi }: { kpi: AdminReportKpi }) {
  return (
    <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} style={{ marginBottom: "12px" }}>
      <tbody>
        <tr>
          <td
            className="rnv-card"
            {...({ bgcolor: C.surface } as any)}
            style={{
              backgroundColor: C.surface,
              border: `1px solid ${C.border}`,
              borderLeft: `4px solid ${C.orange}`,
              borderRadius: "12px",
              padding: "16px 18px",
            }}
          >
            <Text className="rnv-mut" style={{ margin: 0, fontSize: "11px", letterSpacing: "1px", color: C.muted, textTransform: "uppercase", fontFamily: FONT }}>
              {kpi.icon} {kpi.label}
            </Text>
            <Text className="rnv-txt" style={{ margin: "8px 0 0", fontSize: "26px", lineHeight: "30px", fontWeight: 800, color: C.text, fontFamily: FONT }}>
              {kpi.value}
            </Text>

            <DeltaBadge delta={kpi.delta} />
          </td>
        </tr>
      </tbody>
    </table>
  );
}

function DataSection({ title, icon, rows }: { title: string; icon: string; rows: AdminReportRow[] }) {
  return (
    <Section style={{ marginTop: "26px" }}>
      <Heading
        as="h2"
        style={{ margin: "0 0 10px", fontSize: "13px", letterSpacing: "1.4px", textTransform: "uppercase", color: C.orange, fontFamily: FONT }}
      >
        {icon} {title}
      </Heading>
      <table
        role="presentation"
        width="100%"
        cellPadding={0}
        cellSpacing={0}
        className="rnv-card"
        {...({ bgcolor: C.surface } as any)}
        style={{ backgroundColor: C.surface, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "6px 16px" }}
      >
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.label}>
              <td
                className="rnv-mut"
                style={{
                  padding: "11px 0",
                  borderBottom: i === rows.length - 1 ? "none" : `1px solid ${C.border}`,
                  color: C.muted,
                  fontSize: "14px",
                  fontFamily: FONT,
                }}
              >
                {r.label}
              </td>
              <td
                align="right"
                className="rnv-txt"
                style={{
                  padding: "11px 0",
                  borderBottom: i === rows.length - 1 ? "none" : `1px solid ${C.border}`,
                  color: C.text,
                  fontSize: "14px",
                  fontWeight: 700,
                  fontFamily: FONT,
                }}
              >

                {r.value}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}

export function AdminReportEmail(props: AdminReportEmailProps) {
  const { kpis, financial, users, content, alerts, links } = props;

  return (
    <Html lang="pt-BR">
      <Head>
        {/* Impede que Gmail/Outlook apliquem inversão automática de cores
            (causa clássica de "blocos brancos" com texto invisível). */}
        <meta name="color-scheme" content="light only" />
        <meta name="supported-color-schemes" content="light only" />
        <style
          dangerouslySetInnerHTML={{
            __html: `
:root { color-scheme: light only; supported-color-schemes: light only; }
.rnv-page { background-color:${C.page} !important; }
.rnv-card { background-color:${C.surface} !important; }
.rnv-white { background-color:${C.white} !important; }
.rnv-dark { background-color:${C.black} !important; }
.rnv-txt, .rnv-txt * { color:${C.text} !important; }
.rnv-mut, .rnv-mut * { color:${C.muted} !important; }
.rnv-inv, .rnv-inv * { color:${C.white} !important; }
@media (prefers-color-scheme: dark) {
  .rnv-page { background-color:${C.page} !important; }
  .rnv-card { background-color:${C.surface} !important; }
  .rnv-white { background-color:${C.white} !important; }
  .rnv-dark { background-color:${C.black} !important; }
  .rnv-txt, .rnv-txt * { color:${C.text} !important; }
  .rnv-mut, .rnv-mut * { color:${C.muted} !important; }
  .rnv-inv, .rnv-inv * { color:${C.white} !important; }
}
[data-ogsc] .rnv-card, [data-ogsb] .rnv-card { background-color:${C.surface} !important; }
[data-ogsc] .rnv-white, [data-ogsb] .rnv-white { background-color:${C.white} !important; }
[data-ogsc] .rnv-txt, [data-ogsc] .rnv-txt * { color:${C.text} !important; }
[data-ogsc] .rnv-mut, [data-ogsc] .rnv-mut * { color:${C.muted} !important; }
[data-ogsc] .rnv-inv, [data-ogsc] .rnv-inv * { color:${C.white} !important; }
`,
          }}
        />
      </Head>
      <Preview>{props.previewText}</Preview>
      <Body
        className="rnv-page"
        {...({ bgcolor: C.page } as any)}
        style={{ margin: 0, padding: 0, backgroundColor: C.page, fontFamily: FONT }}
      >

        <Container style={{ width: "100%", maxWidth: "660px", margin: "0 auto", padding: "0 0 28px" }}>
          {/* Header */}
          <Section className="rnv-dark" {...({ bgcolor: C.black } as any)} style={{ backgroundColor: C.black, borderBottom: `3px solid ${C.orange}`, padding: "22px 24px" }}>
            <Row>
              <Column style={{ width: "150px", verticalAlign: "middle" }}>
                <Img src={EMAIL_ASSETS.lockup} width="140" alt={BRAND.name} style={{ display: "block", width: "140px", height: "auto" }} />
              </Column>
              <Column style={{ verticalAlign: "middle", paddingLeft: "12px" }}>

                <Text style={{ margin: "2px 0 0", fontSize: "12px", color: "#FF8A3D", fontWeight: 700, letterSpacing: "0.6px", fontFamily: FONT }}>
                  {props.reportType.toUpperCase()}
                </Text>
                <Text className="rnv-inv" style={{ margin: "2px 0 0", fontSize: "12px", color: "#D4D4D8", fontFamily: FONT }}>
                  Referência: {props.reportDate}
                </Text>
              </Column>
            </Row>
          </Section>

          <Section className="rnv-white" bgcolor={C.white} style={{ backgroundColor: C.white, padding: "22px 20px 26px" }}>
            <Heading as="h1" className="rnv-txt" style={{ margin: "0 0 4px", fontSize: "20px", color: C.text, fontFamily: FONT }}>
              Resumo executivo
            </Heading>
            <Text className="rnv-mut" style={{ margin: "0 0 18px", fontSize: "13px", color: C.muted, fontFamily: FONT }}>
              Visão consolidada de vendas, usuários, conteúdo e saúde operacional da plataforma.
            </Text>


            {/* KPIs */}
            {kpis.map((k) => (
              <KpiCard key={k.label} kpi={k} />
            ))}

            <DataSection title="Financeiro" icon="💰" rows={financial} />
            <DataSection title="Usuários" icon="👥" rows={users} />
            <DataSection title="Conteúdo" icon="📚" rows={content} />

            {/* Alertas */}
            <Section style={{ marginTop: "26px" }}>
              <Heading
                as="h2"
                style={{ margin: "0 0 10px", fontSize: "13px", letterSpacing: "1.4px", textTransform: "uppercase", color: C.orange, fontFamily: FONT }}
              >
                🚨 Alertas
              </Heading>
              {alerts.map((a) => {
                const color = alertColor(a.level);
                return (
                  <table
                    role="presentation"
                    width="100%"
                    cellPadding={0}
                    cellSpacing={0}
                    key={a.title}
                    style={{ marginBottom: "10px" }}
                  >
                    <tbody>
                      <tr>
                        <td
                          className="rnv-card"
                          {...({ bgcolor: C.surface } as any)}
                          style={{
                            backgroundColor: C.surface,
                            border: `1px solid ${color}`,
                            borderLeft: `5px solid ${color}`,
                            borderRadius: "10px",
                            padding: "13px 16px",
                          }}
                        >
                          <Text style={{ margin: 0, fontSize: "14px", fontWeight: 700, color, fontFamily: FONT }}>
                            {a.level === "critical" ? "CRÍTICO" : a.level === "warning" ? "ATENÇÃO" : "NORMAL"} · {a.title}
                          </Text>
                          {a.detail ? (
                            <Text className="rnv-mut" style={{ margin: "5px 0 0", fontSize: "13px", color: C.muted, fontFamily: FONT }}>
                              {a.detail}
                            </Text>
                          ) : null}

                        </td>
                      </tr>
                    </tbody>
                  </table>
                );
              })}
            </Section>

            {/* Botões */}
            <Section style={{ marginTop: "26px" }}>
              {[
                { label: "Abrir Dashboard", href: links.dashboard, primary: true },
                { label: "Abrir Financeiro", href: links.financial },
                { label: "Abrir Usuários", href: links.users },
                { label: "Abrir Afiliados", href: links.affiliates },
              ].map((b) => (
                <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} key={b.label} style={{ marginBottom: "10px" }}>
                  <tbody>
                    <tr>
                      <td align="center" className={b.primary ? undefined : "rnv-white"} {...({ bgcolor: b.primary ? C.orange : C.white } as any)}
                        style={{ backgroundColor: b.primary ? C.orange : C.white, border: `1px solid ${b.primary ? C.orange : C.border}`, borderRadius: "10px" }}>
                        <Link
                          href={b.href}
                          className={b.primary ? "rnv-inv" : "rnv-txt"}
                          style={{
                            display: "block",
                            padding: "13px 18px",
                            fontSize: "14px",
                            fontWeight: 700,
                            color: b.primary ? C.white : C.text,
                            textDecoration: "none",
                            fontFamily: FONT,
                          }}
                        >
                          {b.label}
                        </Link>
                      </td>
                    </tr>
                  </tbody>
                </table>
              ))}
            </Section>

            <Hr style={{ borderColor: C.border, margin: "26px 0 14px" }} />

            {/* Rodapé */}
            <Text className="rnv-mut" style={{ margin: 0, fontSize: "11px", lineHeight: "18px", color: C.muted, textAlign: "center", fontFamily: FONT }}>

              Relatório gerado automaticamente pela plataforma {BRAND.name}.
              <br />
              Data/Hora: {props.generatedAt} (Brasília) · Ambiente: {props.environment}
              <br />
              Documento interno — não encaminhe para clientes.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export default AdminReportEmail;
