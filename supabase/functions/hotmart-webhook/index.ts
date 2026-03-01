import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

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
    const { error: errPedido } = await supabase.from("pedidos").insert({
      email,
      nome,
      hotmart_transaction: transacao,
      status: "aguardando_prints",
    });

    if (errPedido && !errPedido.message.includes("duplicate")) {
      console.error("Erro ao criar pedido:", errPedido);
      return new Response("Erro ao criar pedido", { status: 500, headers: corsHeaders });
    }

    // Envia magic link por email (signInWithOtp envia de fato, generateLink não)
    const { error: otpErr } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: "https://real4d.me/minha-analise" },
    });
    if (otpErr) console.error("Erro ao enviar magic link:", otpErr);

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

  return new Response(JSON.stringify({ ignorado: evento }), { status: 200, headers: corsHeaders });
});
