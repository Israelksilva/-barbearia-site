import * as backend from './supabase-api.js';

export const $ = (s) => document.querySelector(s);
export const escape = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const money = (n) => (n / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const clock = (n) => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
export const dateLabel = (d) => d.split('-').reverse().join('/');
export let currentUser = null;
export const api = backend.api;

let timer;
export function toast(message) {
  let e = $('#toast');
  if (!e) { e = document.createElement('div'); e.id = 'toast'; e.setAttribute('role', 'status'); document.body.append(e); }
  e.textContent = message;
  e.hidden = false;
  clearTimeout(timer);
  timer = setTimeout(() => (e.hidden = true), 7000);
}
export function closeDialogs() { document.querySelectorAll('dialog[open]').forEach((d) => d.close()); }
export function wireDialogs() {
  document.addEventListener('click', (e) => { const close = e.target.closest('[data-close]'); if (close) close.closest('dialog').close(); });
  document.querySelectorAll('dialog').forEach((d) => d.addEventListener('click', (e) => {
    if (e.target !== d) return;
    const r = d.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) d.close();
  }));
}
export function download(name, text, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
export async function submit(form, fn) {
  const button = form.querySelector('[type=submit]') || form.querySelector('.button'), error = form.querySelector('.error');
  if (button) button.disabled = true;
  if (error) error.textContent = '';
  try { return await fn(Object.fromEntries(new FormData(form))); }
  catch (e) { if (error) error.textContent = e.message; else toast(e.message); }
  finally { if (button) button.disabled = false; }
}

let pending = null, keyForDownload = '';
function authChanged() {
  document.querySelectorAll('[data-account]').forEach((e) => (e.textContent = currentUser ? currentUser.name.split(' ')[0] : 'Entrar'));
  document.dispatchEvent(new CustomEvent('authchange', { detail: currentUser }));
}
export function updateUser(user) { currentUser = user; authChanged(); }
export function showRecoveryKey(key) {
  keyForDownload = key;
  $('#recovery-key').textContent = key;
  closeDialogs();
  $('#key-dialog').showModal();
}
export async function newRecoveryKey() { showRecoveryKey(await backend.rpc('issue_recovery_key')); }
function mode(value) {
  document.querySelectorAll('[data-mode]').forEach((b) => { const on = b.dataset.mode === value; b.classList.toggle('active', on); b.setAttribute('aria-pressed', on); });
  document.querySelectorAll('[data-auth-panel]').forEach((e) => (e.hidden = e.dataset.authPanel !== value));
  $('#auth-error').textContent = '';
  $('#auth-title').textContent = { login: 'Bom ter você por aqui.', register: 'Seu próximo corte começa aqui.', recover: 'Recupere seu acesso.' }[value];
}
export function ensureLogin(callback) {
  if (currentUser) return callback();
  pending = callback;
  mode('login');
  closeDialogs();
  $('#auth-dialog').showModal();
}
async function runPending() { const action = pending; pending = null; if (action) await action(); }

export async function initAuth() {
  document.body.insertAdjacentHTML('beforeend', `<dialog id="auth-dialog"><div class="dialog-top"><p class="eyebrow">SUA CONTA</p><button class="close" data-close aria-label="Fechar">×</button></div><h2 id="auth-title">Bom ter você por aqui.</h2><div class="auth-tabs"><button type="button" data-mode="login">Entrar</button><button type="button" data-mode="register">Criar conta</button><button type="button" data-mode="recover">Recuperar acesso</button></div>
 <form data-auth-panel="login" id="login-form"><label>E-mail<input name="email" type="email" autocomplete="username" required maxlength="254"></label><label>Senha<input name="password" type="password" autocomplete="current-password" required maxlength="200"></label><button class="button" type="submit">Entrar ↗</button></form>
 <form data-auth-panel="register" id="register-form" hidden><label>Nome completo<input name="name" autocomplete="name" required minlength="2" maxlength="120"></label><label>E-mail<input name="email" type="email" autocomplete="email" required maxlength="254"></label><label>Crie uma senha<input name="password" type="password" autocomplete="new-password" required minlength="12" maxlength="200" placeholder="Pelo menos 12 caracteres"></label><label class="check"><input name="privacy" type="checkbox" required>Li o <a href="privacidade.html" target="_blank">aviso de privacidade</a>.</label><button class="button" type="submit">Criar minha conta ↗</button></form>
 <form data-auth-panel="recover" id="recover-form" hidden><p class="muted small">Use a chave de recuperação que você salvou ao criar a conta. Se perdeu a chave, fale com a barbearia.</p><label>E-mail<input name="email" type="email" autocomplete="email" required></label><label>Chave de recuperação<input name="recoveryKey" autocomplete="off" required maxlength="64"></label><label>Nova senha<input name="password" type="password" autocomplete="new-password" required minlength="12" maxlength="200"></label><button class="button" type="submit">Recuperar com minha chave</button></form><p id="auth-error" class="error" role="alert"></p></dialog>
 <dialog id="key-dialog"><div class="dialog-top"><p class="eyebrow">GUARDE EM UM LUGAR SEGURO</p><button class="close" data-close aria-label="Fechar">×</button></div><h2>Sua chave de recuperação.</h2><p class="muted">Ela permite trocar sua senha caso você perca o acesso. Não compartilhe com ninguém. Esta chave é mostrada apenas agora.</p><code id="recovery-key"></code><button class="button" id="save-key">Salvar chave em arquivo</button><button class="text" id="key-continue">Já salvei, continuar ↗</button></dialog>
 <dialog id="account-dialog"><div class="dialog-top"><p class="eyebrow">MINHA CONTA</p><button class="close" data-close aria-label="Fechar">×</button></div><h2 id="account-name"></h2><p id="account-email" class="muted"></p><div class="stack"><a class="button" href="admin.html" id="owner-link" hidden>Abrir painel do proprietário ↗</a><button class="outline" id="new-key">Gerar nova chave de recuperação</button><button class="outline" id="export-account">Baixar meus dados</button><button class="outline" id="logout">Sair da conta</button></div><details><summary>Alterar senha</summary><form id="password-form"><label>Senha atual<input type="password" name="current" required autocomplete="current-password"></label><label>Nova senha<input type="password" name="password" required minlength="12" maxlength="200" autocomplete="new-password"></label><button class="button" type="submit">Salvar nova senha</button><p class="error" role="alert"></p></form></details><details id="delete-account"><summary>Excluir minha conta</summary><p class="small muted">Sua conta será removida, as reservas ativas serão canceladas e seus dados de contato serão apagados.</p><form id="delete-form"><label>Confirme sua senha<input type="password" name="password" required autocomplete="current-password"></label><button class="button danger" type="submit">Excluir conta e cancelar reservas</button><p class="error" role="alert"></p></form></details></dialog>`);
  document.querySelectorAll('[data-mode]').forEach((b) => (b.onclick = () => mode(b.dataset.mode)));

  const authForm = (id, action) => ($('#' + id).onsubmit = (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    submit(form, async (data) => {
      $('#auth-error').textContent = '';
      try { await action(data, form); }
      catch (err) { $('#auth-error').textContent = err.message; }
    });
  });
  authForm('login-form', async (data) => {
    currentUser = await backend.signIn(data.email, data.password);
    authChanged();
    $('#auth-dialog').close();
    if (currentUser && !currentUser.hasRecoveryKey) await newRecoveryKey();
    else await runPending();
  });
  authForm('register-form', async (data, form) => {
    if (!form.elements.privacy.checked) throw Error('Leia o aviso de privacidade para criar a conta.');
    if (data.password.length < 12) throw Error('Use uma senha de pelo menos 12 caracteres.');
    const user = await backend.signUp(data.name, data.email, data.password);
    if (!user) throw Error('Conta criada. Abra o link de confirmação enviado ao seu e-mail e depois entre.');
    currentUser = user;
    authChanged();
    $('#auth-dialog').close();
    await newRecoveryKey();
  });
  authForm('recover-form', async (data) => {
    const key = await backend.rpc('recover_account', { p_email: data.email, p_key: data.recoveryKey, p_password: data.password });
    currentUser = await backend.signIn(data.email, data.password);
    authChanged();
    $('#auth-dialog').close();
    showRecoveryKey(key);
  });

  $('#save-key').onclick = () => download('barbearia-chave-recuperacao.txt',
    `Chave de recuperação da sua conta na barbearia\n${currentUser?.email || ''}\n\n${keyForDownload}\n\nGuarde em local privado. Uma chave nova invalida a anterior.`);
  $('#key-continue').onclick = async () => { $('#key-dialog').close(); await runPending(); };
  $('#key-dialog').addEventListener('close', () => { keyForDownload = ''; $('#recovery-key').textContent = ''; });
  document.querySelectorAll('[data-account]').forEach((b) => (b.onclick = () => {
    if (!currentUser) { ensureLogin(() => {}); return; }
    $('#account-name').textContent = currentUser.name;
    $('#account-email').textContent = currentUser.email;
    $('#owner-link').hidden = currentUser.role !== 'owner';
    $('#delete-account').hidden = currentUser.role === 'owner';
    $('#account-dialog').showModal();
  }));
  $('#logout').onclick = async () => {
    try { await backend.signOut(); currentUser = null; closeDialogs(); authChanged(); toast('Você saiu da conta.'); }
    catch (e) { toast(e.message); }
  };
  $('#new-key').onclick = async () => {
    if (!confirm('Gerar uma nova chave? A chave anterior deixa de funcionar.')) return;
    try { await newRecoveryKey(); } catch (e) { toast(e.message); }
  };
  $('#export-account').onclick = async () => {
    try { download('meus-dados-barbearia.json', JSON.stringify(await api('account/export'), null, 2), 'application/json'); }
    catch (e) { toast(e.message); }
  };
  $('#password-form').onsubmit = (e) => {
    e.preventDefault();
    submit(e.currentTarget, async (data) => {
      if (data.password.length < 12) throw Error('Use uma senha de 12 a 200 caracteres.');
      try { await backend.changePassword(currentUser.email, data.current, data.password); }
      catch (err) { throw Error(/incorretos/.test(err.message) ? 'Senha atual incorreta.' : err.message); }
      e.target.reset();
      await newRecoveryKey();
    });
  };
  $('#delete-form').onsubmit = (e) => {
    e.preventDefault();
    if (!confirm('Excluir sua conta e cancelar todas as suas reservas ativas?')) return;
    submit(e.currentTarget, async (data) => {
      try { await backend.confirmPassword(currentUser.email, data.password); }
      catch (err) { throw Error(/incorretos/.test(err.message) ? 'Senha incorreta.' : err.message); }
      await backend.rpc('delete_my_account');
      await backend.signOut();
      currentUser = null; closeDialogs(); authChanged(); toast('Conta excluída.');
    });
  };
  try { currentUser = await backend.me(); } catch { currentUser = null; await backend.signOut(); }
  authChanged();
  wireDialogs();
  return currentUser;
}
