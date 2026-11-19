// Ponte entre as telas e o Supabase. As telas continuam chamando api('rota'),
// e este módulo traduz cada rota para a função correspondente no banco.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const configured = /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(SUPABASE_URL) && SUPABASE_ANON_KEY.length > 30;
if (configured && /service_role|sb_secret_/.test(SUPABASE_ANON_KEY + atobSafe(SUPABASE_ANON_KEY.split('.')[1] || ''))) {
  throw Error('config.js contém uma chave secreta (service_role). Use a chave pública "anon"/"publishable".');
}
function atobSafe(v) { try { return atob(v.replace(/-/g, '+').replace(/_/g, '/')); } catch { return ''; } }

export const supabase = configured
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } })
  : null;

const authMessages = [
  [/Invalid login credentials/i, 'E-mail ou senha incorretos.'],
  [/Email not confirmed/i, 'Confirme seu e-mail pelo link enviado antes de entrar.'],
  [/User already registered|already been registered/i, 'Não foi possível cadastrar. Tente entrar ou recuperar sua conta.'],
  [/Database error saving new user/i, 'Cadastro indisponível: a barbearia ainda não liberou novos clientes.'],
  [/Password should be|weak.?password/i, 'Senha fraca. Use pelo menos 12 caracteres, misturando letras e números.'],
  [/rate limit|too many/i, 'Muitas tentativas. Aguarde alguns minutos e tente novamente.'],
  [/Failed to fetch|NetworkError|Load failed/i, 'Sem conexão com o servidor. Confira sua internet e tente novamente.'],
];
export function friendly(error) {
  const message = String(error?.message || error || '');
  for (const [pattern, text] of authMessages) if (pattern.test(message)) return text;
  if (error?.code === 'P0001') return message; // mensagens escritas pelas regras do banco
  if (/JWT|token/i.test(message)) return 'Sua sessão expirou. Entre novamente.';
  console.error(error);
  return 'Não foi possível concluir. Tente novamente.';
}

function ready() {
  if (!supabase) throw Error('O site ainda não foi conectado ao Supabase. Preencha config.js com o endereço e a chave pública do projeto.');
}
export async function rpc(fn, args = {}) {
  ready();
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw Error(friendly(error));
  return data;
}
async function authCall(promise) {
  const { data, error } = await promise;
  if (error) throw Error(friendly(error));
  return data;
}

export async function me() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  if (!data.session) return null;
  return rpc('me');
}
export async function signIn(email, password) {
  ready();
  await authCall(supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password }));
  return me();
}
// Retorna o usuário logado, ou null se o Supabase exigir confirmação de e-mail.
export async function signUp(name, email, password) {
  ready();
  const data = await authCall(supabase.auth.signUp({ email: email.trim().toLowerCase(), password, options: { data: { name: name.trim() } } }));
  return data.session ? me() : null;
}
export async function signOut() { if (supabase) await supabase.auth.signOut(); }
export async function changePassword(email, current, password) {
  ready();
  await authCall(supabase.auth.signInWithPassword({ email, password: current }));
  await authCall(supabase.auth.updateUser({ password }));
}
export async function confirmPassword(email, password) {
  ready();
  await authCall(supabase.auth.signInWithPassword({ email, password }));
}

export async function uploadImage(kind, file) {
  ready();
  const ext = { 'image/png': 'png', 'image/jpeg': 'jpeg', 'image/webp': 'webp' }[file.type];
  if (!ext) throw Error('Envie uma imagem PNG, JPG ou WebP.');
  if (file.size > 2 * 1024 * 1024) throw Error('Imagem deve ter até 2 MB.');
  const path = `${kind}-${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from('media').upload(path, file, { contentType: file.type, upsert: false, cacheControl: '86400' });
  if (error) throw Error(/row-level security|Unauthorized|403/i.test(error.message) ? 'Apenas o proprietário pode enviar imagens.' : friendly(error));
  const url = supabase.storage.from('media').getPublicUrl(path).data.publicUrl;
  return rpc('admin_set_media', { p_kind: kind, p_url: url });
}

// Rotas usadas pelas telas -> funções do banco.
export async function api(route, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const body = options.body ? JSON.parse(options.body) : {};
  const [path, query = ''] = route.split('?');
  const q = new URLSearchParams(query);
  let m;
  if (path === 'catalog') return supabase ? rpc('catalog') : offlineCatalog();
  if (path === 'legal' || (path === 'admin/legal' && method === 'GET')) return rpc('legal_profile');
  if (path === 'auth/me') return { user: await me() };
  if (path === 'slots') return rpc('slots', { p_staff: q.get('staff') || '', p_service: q.get('service') || '', p_date: q.get('date') || '', p_ignore: q.get('ignore') || '' });
  if (path === 'bookings' && method === 'GET') return rpc('my_bookings');
  if (['booking-requests', 'bookings', 'admin/bookings'].includes(path) && method === 'POST')
    return rpc('create_booking', { p: { ...body, key: options.headers?.['Idempotency-Key'] || '', admin: path === 'admin/bookings' } });
  if ((m = path.match(/^(?:admin\/)?bookings\/([0-9a-f-]{36})$/))) {
    if (method === 'DELETE' || body.status === 'cancelled') return rpc('cancel_booking', { p_id: m[1] });
    if (body.status) return rpc('set_booking_status', { p_id: m[1], p_status: body.status });
    return rpc('reschedule_booking', { p_id: m[1], p_staff: body.staff || '', p_date: body.date || '', p_time: body.time || '' });
  }
  if (path === 'account/export') return rpc('export_my_data');
  if (path === 'admin/dashboard') return rpc('admin_dashboard', { p_date: q.get('date') || '', p_staff: q.get('staff') || '' });
  if (path === 'admin/catalog') return rpc('admin_catalog');
  if (path === 'admin/legal' && method === 'PUT') return rpc('admin_save_legal', { p: body });
  if (path === 'admin/settings') return rpc('admin_save_settings', { p: body });
  if ((m = path.match(/^admin\/services(?:\/(.+))?$/))) return rpc('admin_save_service', { p_id: m[1] || '', p: body });
  if ((m = path.match(/^admin\/staff(?:\/(.+))?$/))) return rpc('admin_save_staff', { p_id: m[1] || '', p: body });
  if (path === 'admin/blocks' && method === 'POST') return rpc('admin_create_block', { p: body });
  if ((m = path.match(/^admin\/blocks\/([0-9a-f-]{36})$/))) return rpc('admin_delete_block', { p_id: m[1] });
  if (path === 'admin/audit') return rpc('admin_audit');
  if (path === 'admin/messages') return { enabled: false, provider: '', items: [] };
  throw Error('Função indisponível nesta versão: ' + path);
}

// Mostra a vitrine mesmo antes de conectar o Supabase (sem permitir reservas).
function offlineCatalog() {
  return {
    legal: { enabled: false }, acceptingBookings: false, setupRequired: false, offline: true, emailEnabled: false, storage: 'supabase',
    today: new Date().toISOString().slice(0, 10),
    settings: { name: 'Barbearia Teste', phone: '', address: '', description: 'Cuidado nos detalhes, personalidade no resultado.', logo: 'assets/logo-barbearia.png', photo: '', cancelHours: 2 },
    services: [
      { id: 'corte', name: 'Corte de cabelo', description: 'Corte, acabamento e finalização para o seu estilo.', price: 4500, duration: 30, active: true },
      { id: 'barba', name: 'Barba & cuidado', description: 'Desenho, alinhamento e cuidado com os detalhes.', price: 3500, duration: 30, active: true },
      { id: 'combo', name: 'Corte + barba', description: 'O ritual completo para renovar o visual.', price: 7000, duration: 60, active: true },
    ],
    staff: [],
  };
}
