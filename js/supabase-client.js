const SUPABASE_URL = 'https://xxuxzmegxkwdsboidtmx.supabase.co';
const SUPABASE_KEY = 'sb_publishable_EMmslXi22W3FU3DX2JciMw_uTJDg55Y';
const ADMIN_EMAIL  = 'contato@real4d.me';

const { createClient } = window.supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true }
});

async function getSession() {
  const { data: { session } } = await db.auth.getSession();
  return session;
}

async function requireAuth(redirectTo = '/entrar') {
  const session = await getSession();
  if (!session) { window.location.href = redirectTo; return null; }
  return session;
}

async function requireAdmin() {
  const session = await getSession();
  if (!session || session.user.email !== ADMIN_EMAIL) {
    window.location.href = '/'; return null;
  }
  return session;
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

const STATUS_LABEL = {
  aguardando_prints: 'Aguardando prints',
  prints_enviados:   'Análise em andamento',
  analise_concluida: 'Análise concluída',
  reembolsado:       'Reembolsado',
};

const STATUS_CLASS = {
  aguardando_prints: 'status-aguardando',
  prints_enviados:   'status-enviado',
  analise_concluida: 'status-concluido',
  reembolsado:       'status-reembolsado',
};
