import { api } from './supabase-api.js';
try {
  const p = await api('legal');
  for (const e of document.querySelectorAll('[data-legal]')) e.textContent = p[e.dataset.legal] || 'Não informado';
  document.querySelector('#legal-mode').textContent = p.enabled
    ? 'Informações da operação cadastradas pelo estabelecimento.'
    : 'Instalação em preparação: use apenas dados fictícios. A produção não está liberada.';
} catch {
  document.querySelector('#legal-mode').textContent = 'Não foi possível consultar os dados do responsável. Tente novamente antes de fornecer dados pessoais.';
}
