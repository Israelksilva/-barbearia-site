import { api } from './supabase-api.js';
try {
  const p = await api('legal');
  for (const e of document.querySelectorAll('[data-legal]')) e.textContent = p[e.dataset.legal] || 'Não informado';
  document.querySelector('#legal-mode').textContent = p.operatorName
    ? 'Informações da operação cadastradas pelo estabelecimento.'
    : 'O estabelecimento ainda não cadastrou seus dados de identificação. Para dúvidas sobre seus dados, fale com a barbearia.';
} catch {
  document.querySelector('#legal-mode').textContent = 'Não foi possível consultar os dados do responsável. Tente novamente antes de fornecer dados pessoais.';
}
