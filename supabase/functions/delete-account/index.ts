import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function emailExclusao(nome: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="dark" />
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
                      Conta excluída
                    </h1>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding:0 40px 32px;">
                    <p style="margin:0;font-size:15px;line-height:1.7;color:#6e7a94;">
                      ${nome ? `Olá ${nome}, seus` : 'Seus'} dados foram removidos da plataforma REAL 4D conforme sua solicitação, em conformidade com a Lei Geral de Proteção de Dados (LGPD).
                    </p>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding:0 40px 24px;">
                    <p style="margin:0;font-size:14px;line-height:1.7;color:#6e7a94;">
                      Foram excluídos:<br />
                      • Prints de conversas enviados<br />
                      • Respostas do questionário<br />
                      • Relatórios gerados<br />
                      • Dados de pedidos<br />
                      • Conta de acesso
                    </p>
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
                      Se você não solicitou esta exclusão, entre em contato conosco em
                      <a href="mailto:contato@real4d.me" style="color:#d4186b;text-decoration:none;">contato@real4d.me</a>.
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  // Valida token do usuário
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response("Não autorizado", { status: 401, headers: corsHeaders });
  }

  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return new Response("Token inválido", { status: 401, headers: corsHeaders });
  }

  const email = user.email!;
  const nome = user.user_metadata?.nome || "";

  try {
    // 1. Busca todos os pedidos do usuário
    const { data: pedidos } = await supabase
      .from("pedidos")
      .select("id")
      .eq("email", email);

    const pedidoIds = pedidos?.map((p) => p.id) || [];

    if (pedidoIds.length > 0) {
      // 2. Busca prints para deletar do Storage
      const { data: prints } = await supabase
        .from("prints")
        .select("storage_path")
        .in("pedido_id", pedidoIds);

      // 3. Busca relatórios para deletar do Storage
      const { data: relatorios } = await supabase
        .from("relatorios")
        .select("storage_path")
        .in("pedido_id", pedidoIds);

      // 4. Deleta arquivos do Storage
      if (prints && prints.length > 0) {
        await supabase.storage
          .from("prints")
          .remove(prints.map((p) => p.storage_path));
      }

      if (relatorios && relatorios.length > 0) {
        await supabase.storage
          .from("relatorios")
          .remove(relatorios.map((r) => r.storage_path));
      }

      // 5. Deleta registros do banco (ordem: dependentes primeiro)
      await supabase.from("prints").delete().in("pedido_id", pedidoIds);
      await supabase.from("respostas").delete().in("pedido_id", pedidoIds);
      await supabase.from("relatorios").delete().in("pedido_id", pedidoIds);
      await supabase.from("pedidos").delete().eq("email", email);
    }

    // 6. Deleta usuário do Auth
    const { error: deleteError } = await supabase.auth.admin.deleteUser(user.id);
    if (deleteError) {
      console.error("Erro ao deletar usuário do Auth:", deleteError);
      return new Response("Erro ao excluir conta", { status: 500, headers: corsHeaders });
    }

    // 7. Envia email de confirmação
    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "REAL 4D <noreply@real4d.me>",
          to: [email],
          subject: "Sua conta foi excluída — REAL 4D",
          html: emailExclusao(nome),
        }),
      });
    } catch (emailErr) {
      console.error("Erro ao enviar email de exclusão:", emailErr);
      // Não falha — a conta já foi excluída
    }

    console.log(`Conta excluída: ${email}`);
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Erro na exclusão:", err);
    return new Response("Erro interno", { status: 500, headers: corsHeaders });
  }
});
