import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { flowType: "implicit" } }
);

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// ── Email templates ──────────────────────────────────────────

function emailLayout(heading: string, description: string, buttonText: string, buttonUrl: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="dark" />
  <meta name="supported-color-schemes" content="dark" />
</head>
<body style="margin:0;padding:0;background-color:#07070e;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#07070e;">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
          <tr>
            <td align="center" style="padding-bottom:32px;">
              <img src="https://real4d.me/assets/logo-without-name-back-black.png"
                   alt="REAL 4D" width="56" height="56"
                   style="display:block;border-radius:12px;" />
            </td>
          </tr>
          <tr>
            <td>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                     style="background-color:#0d0d1c;border:1px solid rgba(255,255,255,0.07);border-radius:14px;">
                <tr>
                  <td align="center" style="padding:40px 40px 8px;">
                    <h1 style="margin:0;font-size:22px;font-weight:700;color:#eeeef4;letter-spacing:-0.02em;">
                      ${heading}
                    </h1>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding:0 40px 32px;">
                    <p style="margin:0;font-size:15px;line-height:1.7;color:#6e7a94;">
                      ${description}
                    </p>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding:0 40px 32px;">
                    <table role="presentation" cellpadding="0" cellspacing="0">
                      <tr>
                        <td align="center" style="background:linear-gradient(135deg,#e82077,#a855f7);border-radius:999px;">
                          <a href="${buttonUrl}" target="_blank"
                             style="display:inline-block;padding:14px 40px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;letter-spacing:0.03em;">
                            ${buttonText}
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 40px;">
                    <div style="height:1px;background-color:rgba(255,255,255,0.07);"></div>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding:24px 40px 36px;">
                    <p style="margin:0;font-size:12px;line-height:1.7;color:#6e7a94;">
                      Este link expira em 1 hora.<br />
                      Se você não reconhece esta ação, ignore este e-mail.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:24px 0 0;">
              <p style="margin:0;font-size:12px;color:#6e7a94;">
                <a href="https://real4d.me" style="color:#d4186b;text-decoration:none;font-weight:600;">REAL 4D</a>
                <span style="margin:0 6px;color:#333;">·</span>
                Análise comportamental de conversas
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

async function sendEmail(to: string, subject: string, html: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "REAL 4D <noreply@real4d.me>",
      to: [to],
      subject,
      html,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("Resend error:", err);
    throw new Error(`Resend API error: ${res.status}`);
  }

  return await res.json();
}

async function generateMagicLink(email: string, redirectPath: string): Promise<string> {
  const { data, error } = await supabase.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo: `https://real4d.me${redirectPath}` },
  });

  if (error || !data?.properties?.action_link) {
    console.error("Erro ao gerar magic link:", error);
    throw new Error("Falha ao gerar magic link");
  }

  return data.properties.action_link;
}

// ── Handler ──────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400, headers: corsHeaders });
  }

  const evento    = body?.event;
  const dados     = body?.data;

  if (!evento || !dados) {
    return new Response("Payload inválido", { status: 400, headers: corsHeaders });
  }

  const email     = dados?.buyer?.email?.toLowerCase();
  const nome      = dados?.buyer?.name;
  const transacao = dados?.purchase?.transaction;

  if (!email || !transacao) {
    return new Response("Dados insuficientes", { status: 400, headers: corsHeaders });
  }

  // ── Pagamento aprovado ────────────────────────────────────
  if (evento === "PURCHASE_APPROVED") {

    // Cria ou recupera usuário no Auth
    const { data: userList } = await supabase.auth.admin.listUsers();
    const usuarioExistente = userList?.users?.find((u) => u.email === email);

    if (!usuarioExistente) {
      const { error: errUsuario } = await supabase.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { nome },
      });

      if (errUsuario) {
        console.error("Erro ao criar usuário:", errUsuario);
        return new Response("Erro ao criar usuário", { status: 500, headers: corsHeaders });
      }
    }

    // Cria pedido no banco
    const { data: pedidoCriado, error: errPedido } = await supabase.from("pedidos").insert({
      email,
      nome,
      hotmart_transaction: transacao,
      status: "aguardando_prints",
    }).select("id").single();

    if (errPedido && !errPedido.message.includes("duplicate")) {
      console.error("Erro ao criar pedido:", errPedido);
      return new Response("Erro ao criar pedido", { status: 500, headers: corsHeaders });
    }

    // Se duplicado, busca o id existente
    let pedidoId = pedidoCriado?.id;
    if (!pedidoId) {
      const { data: existente } = await supabase.from("pedidos")
        .select("id").eq("hotmart_transaction", transacao).single();
      pedidoId = existente?.id;
    }
    const pedidoRef = pedidoId ? `#${pedidoId.substring(0, 8)}` : '';

    // Email A — Pedido confirmado + magic link
    try {
      const magicLink = await generateMagicLink(email, "/minha-analise");
      const html = emailLayout(
        "Pedido confirmado!",
        `Seu pedido REAL 4D ${pedidoRef ? `<span style="font-family:monospace;opacity:0.7;">(${pedidoRef})</span> ` : ''}foi recebido com sucesso. Clique abaixo para enviar os prints da conversa e iniciar sua análise.`,
        "ENVIAR MEUS PRINTS",
        magicLink,
      );
      await sendEmail(email, `Pedido confirmado ${pedidoRef} — REAL 4D`, html);
    } catch (err) {
      console.error("Erro ao enviar email de confirmação:", err);
    }

    console.log(`Pedido criado: ${email} — ${transacao}`);
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: corsHeaders });
  }

  // ── Reembolso / chargeback ────────────────────────────────
  if (evento === "PURCHASE_REFUNDED" || evento === "PURCHASE_CHARGEBACK") {
    await supabase
      .from("pedidos")
      .update({ status: "reembolsado" })
      .eq("hotmart_transaction", transacao);

    console.log(`Pedido reembolsado: ${transacao}`);
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: corsHeaders });
  }

  // ── Relatório pronto ──────────────────────────────────────
  if (evento === "REPORT_READY") {
    // Busca pedido para obter id
    const { data: pedidoReport } = await supabase.from("pedidos")
      .select("id").eq("hotmart_transaction", transacao).single();
    const reportRef = pedidoReport?.id ? `#${pedidoReport.id.substring(0, 8)}` : '';

    try {
      const magicLink = await generateMagicLink(email, "/minha-analise");
      const html = emailLayout(
        "Seu relatório está pronto!",
        `A análise da sua conversa ${reportRef ? `<span style="font-family:monospace;opacity:0.7;">(${reportRef})</span> ` : ''}foi concluída. Clique abaixo para acessar e baixar o seu Raio-X REAL 4D em PDF.`,
        "VER MEU RELATÓRIO",
        magicLink,
      );
      await sendEmail(email, `Relatório pronto ${reportRef} — REAL 4D`, html);
    } catch (err) {
      console.error("Erro ao enviar email de relatório:", err);
      return new Response("Erro ao enviar email", { status: 500, headers: corsHeaders });
    }

    console.log(`Email relatório pronto enviado: ${email}`);
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: corsHeaders });
  }

  return new Response(JSON.stringify({ ignorado: evento }), { status: 200, headers: corsHeaders });
});
