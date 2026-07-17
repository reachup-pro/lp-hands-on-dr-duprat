// dashboard.js — Painel Dr. Duprat (lead gen) — v3 (datas por intervalo)
import { sb, rpc, CLIENT_ID } from '/dashboard/lib/supabase.js';
import { brl, num, pct, ago, timeBRT, freshness, delta } from '/dashboard/lib/format.js';
import { makeLeadsChart, makeSparkline, COLORS } from '/dashboard/lib/charts.js';

const FONTE_LABEL = { utm: 'Rastreio', manual: 'Planilha', gerenciador: 'Gerenciador', auto: 'Rastreio', planilha: 'Planilha' };

const state = {
  kpis: null, funil: null, atend: null, health: null,
  topAds: [], topAudiences: [], timeline: [], heatmap: [], feed: [],
  charts: { leads: null, sparks: {} }, shown: {},
  lastUpdate: Date.now(),
  periodo: { key: 'mtd', ini: null, fim: null, label: 'este mes' },
  sort: { topAds: { key: 'spend_brl', dir: 'desc' }, topAudiences: { key: 'spend_brl', dir: 'desc' } }
};

// ===== datas (BRT) =====
function hojeBRT() { return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })); }
function ymd(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function rangeFor(key) {
  const h = hojeBRT();
  if (key === 'hoje') return [ymd(h), ymd(h)];
  if (key === 'ontem') { const y = new Date(h); y.setDate(h.getDate() - 1); return [ymd(y), ymd(y)]; }
  if (key === 'mtd') return [ymd(new Date(h.getFullYear(), h.getMonth(), 1)), ymd(h)];
  if (key === 'lastmonth') return [ymd(new Date(h.getFullYear(), h.getMonth() - 1, 1)), ymd(new Date(h.getFullYear(), h.getMonth(), 0))];
  return [ymd(new Date(h.getFullYear(), h.getMonth(), 1)), ymd(h)];
}
function labelFor(key, ini, fim) {
  const M = { hoje: 'hoje', ontem: 'ontem', mtd: 'este mes', lastmonth: 'mes passado' };
  if (M[key]) return M[key];
  const f = (s) => { const p = s.split('-'); return p[2] + '/' + p[1]; };
  return `${f(ini)} a ${f(fim)}`;
}

// ===== helpers =====
function setText(sel, value) { const el = document.querySelector(sel); if (el) { el.textContent = value; el.classList.remove('skeleton'); } }
function escapeHtml(s) { if (s == null) return ''; return String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;'); }
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
function countUp(sel, target) {
  const el = document.querySelector(sel); if (!el) return;
  target = Number(target) || 0; const prev = state.shown[sel]; el.classList.remove('skeleton');
  if (reduceMotion || prev === target) { el.textContent = target.toLocaleString('pt-BR'); state.shown[sel] = target; return; }
  const from = (typeof prev === 'number') ? prev : 0; const dur = 600, t0 = performance.now();
  (function frame(t) { const k = Math.min(1, (t - t0) / dur); const e = 1 - Math.pow(1 - k, 3);
    el.textContent = Math.round(from + (target - from) * e).toLocaleString('pt-BR'); if (k < 1) requestAnimationFrame(frame); })(performance.now());
  state.shown[sel] = target;
}
function setDelta(sel, atual, anterior, lessIsBetter = false) {
  const el = document.querySelector(sel); if (!el) return;
  if (anterior == null || anterior === 0) { el.textContent = 'sem base anterior'; el.setAttribute('data-neutral', ''); return; }
  const txt = delta(atual, anterior); el.textContent = `${txt} vs anterior`;
  const n = parseFloat(txt); el.removeAttribute('data-positive'); el.removeAttribute('data-negative'); el.removeAttribute('data-neutral');
  const good = lessIsBetter ? n < 0 : n > 0;
  if (Number.isNaN(n) || n === 0) el.setAttribute('data-neutral', ''); else if (good) el.setAttribute('data-positive', ''); else el.setAttribute('data-negative', '');
}
function applySort(rows, key, dir) {
  if (!rows || !rows.length || !key) return rows; const m = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => { const va = a[key], vb = b[key];
    if (typeof va === 'string' || typeof vb === 'string') { const sa = (va ?? '').toString().toLowerCase(), sbv = (vb ?? '').toString().toLowerCase(); return sa < sbv ? -1 * m : sa > sbv ? 1 * m : 0; }
    const na = va == null ? Infinity * m : Number(va); const nb = vb == null ? Infinity * m : Number(vb); return na < nb ? -1 * m : na > nb ? 1 * m : 0; });
}
function setSortIndicator(table, key, dir) {
  table.querySelectorAll('th.tbl__sortable').forEach(th => { th.classList.remove('tbl__sort-active', 'tbl__sort-asc', 'tbl__sort-desc');
    if (th.dataset.sortKey === key) th.classList.add('tbl__sort-active', dir === 'asc' ? 'tbl__sort-asc' : 'tbl__sort-desc'); });
}
function bindSortableTables() {
  document.querySelectorAll('table[data-table]').forEach(table => { const which = table.dataset.table;
    table.querySelectorAll('th.tbl__sortable').forEach(th => { th.addEventListener('click', () => {
      const key = th.dataset.sortKey; const cur = state.sort[which]; const newDir = (cur.key === key && cur.dir === 'desc') ? 'asc' : 'desc';
      state.sort[which] = { key, dir: newDir }; setSortIndicator(table, key, newDir);
      if (which === 'topAds') renderTopAds(); if (which === 'topAudiences') renderTopAudiences(); }); }); });
}

// ===== gate =====
async function gate() {
  const k = new URLSearchParams(location.search).get('k'); if (!k) return redirectGate();
  try { const r = await rpc('dashboard_validate_token', { p_token: k }); if (!r?.ok) return redirectGate(); }
  catch (e) { console.error('gate:', e); return redirectGate(); }
  return true;
}
function redirectGate() { location.replace('/dashboard/acesso-restrito.html'); return false; }

// ===== render =====
function renderHeader() { setText('[data-clock]', timeBRT(new Date().toISOString())); setText('[data-updated]', `atualizado ${ago(state.lastUpdate)}`); }

function renderMeta(vendas) {
  const metas = (state.kpis?.metas) || [5, 10, 15]; const max = metas[metas.length - 1];
  const fill = document.querySelector('[data-meta-fill]'); if (fill) fill.style.width = `${Math.min(100, vendas / max * 100)}%`;
  const ticksEl = document.querySelector('[data-meta-ticks]');
  if (ticksEl) ticksEl.innerHTML = metas.map(m => `<span class="meta__tick ${vendas >= m ? 'reached' : ''}">${m}</span>`).join('');
  const next = metas.find(m => vendas < m); const st = document.querySelector('[data-meta-status]');
  if (st) st.innerHTML = next ? `faltam <b>${next - vendas}</b> para <b>${next}</b> vendas` : `Meta maxima (<b>${max}</b>) batida!`;
}

function renderPlataformas() {
  const pl = state.kpis?.plataformas; if (!pl) return;
  setText('[data-plat-meta]', `${brl(pl.meta.invest, { cents: false })} · ${num(pl.meta.impressoes, { compact: true })} imp · ${num(pl.meta.cliques, { compact: true })} cliq · ${num(pl.meta.leads)} leads`);
  setText('[data-plat-google]', `${brl(pl.google.invest, { cents: false })} · ${num(pl.google.impressoes, { compact: true })} imp · ${num(pl.google.cliques, { compact: true })} cliq · ${num(pl.google.conversoes)} conv`);
  setText('[data-kpi-invest-plat]', `Meta ${brl(pl.meta.invest, { cents: false })} · Google ${brl(pl.google.invest, { cents: false })}`);
  // leads por plataforma (autorreporte do gerenciador) — distinto do total consistente do card
  setText('[data-kpi-leads-plat]', `Meta ${num(pl.meta.leads)} · Google ${num(pl.google.conversoes)} · gerenciador`);
}

function renderKpis() {
  const k = state.kpis; if (!k) return;
  countUp('[data-hero-vendas]', k.vendas);
  setText('[data-hero-receita]', brl(k.receita_brl, { cents: false }));
  setText('[data-hero-invest]', brl(k.investimento_brl, { cents: false }));
  countUp('[data-hero-leads]', k.leads);
  renderMeta(Number(k.vendas) || 0);
  setText('[data-agend-total]', num(k.agendamentos_total));
  setText('[data-agend-anuncio]', num(k.agendamentos_anuncio));
  // cards
  setText('[data-kpi-vendas]', num(k.vendas));
  setDelta('[data-kpi-vendas-delta]', k.vendas, k.vendas_prev);
  setText('[data-kpi-receita]', brl(k.receita_brl, { cents: false }));
  setDelta('[data-kpi-receita-delta]', k.receita_brl, k.receita_prev_brl);
  setText('[data-kpi-receita-sub]', `${num(k.vendas)} x ${brl(k.valor_consulta, { cents: false })}`);
  setText('[data-kpi-invest]', brl(k.investimento_brl));
  setDelta('[data-kpi-invest-delta]', k.investimento_brl, k.investimento_prev_brl);
  setText('[data-kpi-cac]', k.cac_brl != null ? brl(k.cac_brl) : '—');
  setText('[data-kpi-leads]', num(k.leads));
  setDelta('[data-kpi-leads-delta]', k.leads, k.leads_prev);
  setText('[data-kpi-leads-fonte]', `fonte: ${FONTE_LABEL[k.fonte_leads] || k.fonte_leads}`);
  setText('[data-kpi-cpl]', k.cpl_brl != null ? brl(k.cpl_brl) : '—');
  const cplPrev = (k.leads_prev > 0) ? (k.investimento_prev_brl / k.leads_prev) : null;
  setDelta('[data-kpi-cpl-delta]', k.cpl_brl, cplPrev, true);
  setText('[data-kpi-conv]', pct(k.taxa_conversao));
  // fonte nos graficos
  setText('[data-chart-fonte]', `fonte leads: ${FONTE_LABEL[k.fonte_leads] || k.fonte_leads}`);
  setText('[data-funil-fonte]', `leads: ${FONTE_LABEL[k.fonte_leads] || '—'} · vendas: ${FONTE_LABEL[k.fonte_vendas] || '—'}`);
  renderPlataformas();
}

function renderTimeline() {
  const rows = state.timeline; if (!rows?.length) return;
  const fmt = (s) => { const d = new Date(s + 'T12:00:00Z'); return d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' }); };
  const labels = rows.map(r => fmt(r.data));
  // leads por dia = MAIOR(rastreio, planilha), senao gerenciador (mesma cascata do backend)
  const leads = rows.map(r => { const rr = +r.leads_utm || 0, pp = +r.leads_manual || 0, gg = +r.leads_ger || 0; const mx = Math.max(rr, pp); return mx > 0 ? mx : gg; });
  const vendas = rows.map(r => Number(r.vendas) || 0);
  const invest = rows.map(r => Number(r.investimento_brl) || 0);
  if (state.charts.leads) state.charts.leads.destroy();
  const canvas = document.querySelector('[data-chart-leads]');
  if (canvas) state.charts.leads = makeLeadsChart(canvas, { labels, leads, invest, vendas, hojeIdx: rows.length - 1 });
  renderSpark('leads', leads, COLORS.gold500);
  renderSpark('invest', invest, COLORS.terracotta);
}
function renderSpark(name, data, color) {
  const canvas = document.querySelector(`[data-spark-${name}]`); if (!canvas || !data || !data.length) return;
  if (state.charts.sparks[name]) state.charts.sparks[name].destroy();
  state.charts.sparks[name] = makeSparkline(canvas, data, color);
}

// Venda por anuncio/publico: atribuicao real por telefone e praticamente inexistente na Duprat
// (lead entra por form/WhatsApp sem carregar o anuncio). Quando nao ha venda real atribuida,
// estimamos rateando as vendas do periodo (kpis) proporcional aos leads de cada linha. Rotulado com "≈".
// Grava campos _vendas/_receita/_roas/_cac/_est (idempotente: le sempre os campos reais originais).
function enrichSalesEst(rows) {
  const totV = Number(state.kpis && state.kpis.vendas) || 0;
  const totL = Number(state.kpis && state.kpis.leads) || 0;
  (rows || []).forEach(a => {
    const realV = Number(a.vendas) || 0;
    const spend = Number(a.spend_brl) || 0;
    if (realV > 0) {
      a._vendas = realV; a._receita = Number(a.receita_brl) || 0;
      a._roas = a.roas != null ? Number(a.roas) : null;
      a._cac = a.cac_brl != null ? Number(a.cac_brl) : null; a._est = false;
    } else if (totV > 0 && totL > 0) {
      const v = totV * ((Number(a.leads) || 0) / totL);
      a._vendas = v; a._receita = v * VALOR_CONSULTA;
      a._roas = spend > 0 ? a._receita / spend : null;
      a._cac = v > 0 ? spend / v : null; a._est = true;
    } else {
      a._vendas = 0; a._receita = 0; a._roas = spend > 0 ? 0 : null; a._cac = null; a._est = false;
    }
  });
  return rows;
}
function fmtVendEst(v, est) {
  const n = Number(v) || 0;
  if (!est) return num(n);
  return '≈ ' + (n >= 10 ? Math.round(n).toLocaleString('pt-BR') : n.toFixed(1).replace('.', ','));
}
function adCellsHtml(a) {
  const est = !!a._est;
  const p = est ? '≈ ' : '';
  const roas = a._roas;
  const roasCls = (roas != null && Number(a.spend_brl) > 0) ? (roas >= 1 ? ' class="tbl__num data-good"' : (roas > 0 ? ' class="tbl__num data-bad"' : ' class="tbl__num"')) : ' class="tbl__num"';
  const ec = est ? ' tbl__est' : '';
  return `
    <td class="tbl__num">${brl(a.spend_brl)}</td>
    <td class="tbl__num${ec}" title="venda: ${escapeHtml(est ? 'estimado por rateio de leads' : (a.fonte_venda || '—'))}">${fmtVendEst(a._vendas, est)}<br><small class="tbl__casc">${est ? 'estimado' : 'atrib ' + num(a.vendas_atrib) + ' · pixel ' + num(a.vendas_pixel)}</small></td>
    <td class="tbl__num${ec}">${p}${brl(a._receita, { cents: false })}</td>
    <td${roasCls}>${roas == null ? '—' : p + Number(roas).toFixed(2)}</td>
    <td class="tbl__num${ec}">${a._cac == null ? '—' : p + brl(a._cac)}</td>
    <td class="tbl__num" title="lead: ${escapeHtml(a.fonte_leads || '—')}">${num(a.leads)}<br><small class="tbl__casc">rastr ${num(a.leads_rastreio)} · ger ${num(a.leads_ger)}</small></td>
    <td class="tbl__num">${a.cpl_brl == null ? '—' : brl(a.cpl_brl)}</td>`;
}
function renderTopAds() {
  const tbody = document.querySelector('[data-topads-body]'); if (!tbody) return;
  if (!state.topAds.length) { tbody.innerHTML = `<tr><td colspan="9" class="tbl-empty">Sem dados de anuncios no periodo</td></tr>`; return; }
  enrichSalesEst(state.topAds);
  const { key, dir } = state.sort.topAds;
  tbody.innerHTML = applySort(state.topAds, key, dir).map(a => {
    const _ini = (((a.ad_name || 'AD').match(/[A-Za-z0-9]+/g)) || ['AD']).slice(0, 2).map(w => w[0]).join('').toUpperCase();
    const _bg = a.thumbnail_url ? `background-image:url('/.netlify/images?url=${encodeURIComponent(a.thumbnail_url)}&w=96&h=96&fit=cover&q=80'),linear-gradient(140deg,#20262A,#101315);` : '';
    const thumb = `<div class="tbl__thumb" data-ini="${escapeHtml(_ini)}" style="${_bg}"></div>`;
    const name = a.instagram_permalink_url ? `<a href="${escapeHtml(a.instagram_permalink_url)}" target="_blank" rel="noopener noreferrer" class="tbl__ad-link">${escapeHtml(a.ad_name || '—')} <span class="tbl__ext">↗</span></a>` : escapeHtml(a.ad_name || '—');
    return `<tr><td>${thumb}</td><td>${name}</td>${adCellsHtml(a)}</tr>`;
  }).join('');
}
function renderTopAudiences() {
  const tbody = document.querySelector('[data-topaudiences-body]'); if (!tbody) return;
  if (!state.topAudiences.length) { tbody.innerHTML = `<tr><td colspan="8" class="tbl-empty">Sem dados de publicos no periodo</td></tr>`; return; }
  enrichSalesEst(state.topAudiences);
  const { key, dir } = state.sort.topAudiences;
  tbody.innerHTML = applySort(state.topAudiences, key, dir).map(a =>
    `<tr><td>${escapeHtml(a.adset_name || '—')}<br><small style="color:var(--cream-3)">${escapeHtml(a.campaign_name || '')}</small></td>${adCellsHtml(a)}</tr>`).join('');
}

function renderHeatmap() {
  const data = state.heatmap || [];
  const gridEl = document.querySelector('[data-heatmap-grid]'); const hoursEl = document.querySelector('[data-heatmap-hours]');
  const daysEl = document.querySelector('[data-heatmap-days]'); const topEl = document.querySelector('[data-heatmap-top]');
  if (!gridEl) return;
  if (hoursEl && !hoursEl.children.length) hoursEl.innerHTML = Array.from({ length: 24 }, (_, h) => `<span>${String(h).padStart(2, '0')}</span>`).join('');
  const diasLabels = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'];
  if (daysEl && !daysEl.children.length) daysEl.innerHTML = diasLabels.map(d => `<span>${d}</span>`).join('');
  const m = new Map(); let max = 0;
  for (const r of data) { const v = Number(r.qtd) || 0; m.set(`${r.dia_semana}-${r.hora}`, v); if (v > max) max = v; }
  const cells = []; let topV = 0, topD = 0, topH = 0;
  for (let d = 0; d < 7; d++) for (let h = 0; h < 24; h++) {
    const v = m.get(`${d}-${h}`) || 0; const op = max > 0 ? Math.min(1, 0.08 + 0.92 * (v / max)) : 0.08;
    const t = v > 0 ? `${diasLabels[d]} ${String(h).padStart(2, '0')}h: ${v} lead${v > 1 ? 's' : ''}` : `${diasLabels[d]} ${String(h).padStart(2, '0')}h: sem leads`;
    cells.push(`<div class="heatmap__cell" ${v > 0 ? `data-qtd="${v}"` : ''} style="background:rgba(244,187,66,${op.toFixed(3)})" title="${t}"></div>`);
    if (v > topV) { topV = v; topD = d; topH = h; } }
  gridEl.innerHTML = cells.join('');
  if (topEl) topEl.textContent = topV > 0 ? `pico: ${diasLabels[topD]} ${String(topH).padStart(2, '0')}h (${topV} leads)` : 'sem leads no periodo';
}

function renderFunil() {
  const f = state.funil; if (!f) return; const max = Math.max(f.impressoes || 1, 1);
  const set = (sel, val, pctVal) => { const row = document.querySelector(sel); if (!row) return;
    const fill = row.querySelector('.funil__bar-fill'); if (fill) fill.style.width = `${Math.min(100, (val / max) * 100)}%`;
    const numEl = row.querySelector('.funil__num'); if (numEl) { numEl.textContent = num(val, { compact: true }); numEl.classList.remove('skeleton'); }
    const pctEl = row.querySelector('.funil__pct'); if (pctEl && pctVal != null) pctEl.textContent = pct(pctVal); };
  set('[data-funil-impr]', f.impressoes, null);
  set('[data-funil-clicks]', f.cliques, f.ctr);
  set('[data-funil-leads]', f.leads, f.conv_clique_lead);
  set('[data-funil-vendas]', f.vendas, f.conv_lead_venda);
  setText('[data-funil-ctr]', pct(f.ctr)); setText('[data-funil-cpm]', brl(f.cpm_brl));
  setText('[data-funil-cpc]', brl(f.cpc_brl)); setText('[data-funil-conv-venda]', pct(f.conv_lead_venda));
}

function renderAtendimento() {
  const a = state.atend; if (!a) return;
  // funil: Leads -> Agendou (pagou sinal) -> Compareceu -> Fechou (plano). pct = conversao do estagio anterior.
  const leads = Number(a.total_leads) || 0, agend = Number(a.agendadas) || 0, comp = Number(a.compareceu) || 0, fech = Number(a.fechou) || 0;
  const conv = (v, base) => base > 0 ? pct(v * 100 / base) : '—';
  setText('[data-atend-leads]', num(leads));
  setText('[data-atend-agendadas]', num(agend)); setText('[data-atend-agendadas-pct]', conv(agend, leads));
  // estagios projetados (planilha sem dado) marcados com ≈ + borda tracejada
  const cp = !!a.compareceu_projetado, fp = !!a.fechou_projetado;
  setText('[data-atend-compareceu]', (cp ? '≈ ' : '') + num(comp)); setText('[data-atend-compareceu-pct]', conv(comp, agend));
  setText('[data-atend-fechou]', (fp ? '≈ ' : '') + num(fech)); setText('[data-atend-fechou-pct]', conv(fech, comp));
  markProjStep('[data-atend-compareceu]', cp); markProjStep('[data-atend-fechou]', fp);
  setText('[data-atend-pago]', num(a.pago)); setText('[data-atend-indicacao]', num(a.indicacao));
  setText('[data-atend-valor]', brl(a.valor_total_brl, { cents: false }));
  // sinaliza projecao: badge no titulo + nota explicando que e calculo medio da base da Reach Up
  const anyProj = cp || fp;
  const badge = document.querySelector('[data-atend-proj-badge]'); if (badge) badge.hidden = !anyProj;
  const projEl = document.querySelector('[data-atend-proj]');
  if (projEl) {
    const parts = [];
    if (cp) parts.push('comparecimento (100% dos agendamentos)');
    if (fp) parts.push('fechamento (50% dos que compareceram)');
    if (anyProj) { projEl.textContent = `Projeção: ${parts.join(' e ')} ainda não estão na planilha — estimado por médias da base de dados da Reach Up.`; projEl.hidden = false; }
    else projEl.hidden = true;
  }
}
function markProjStep(sel, projected) {
  const step = document.querySelector(sel)?.closest('.atend__step');
  if (step) step.classList.toggle('is-proj', projected);
}

// origem do lead -> chave de estilo (dot colorido). Rotulo vem pronto da RPC (Instagram/Facebook/Google/Direto/Meta).
function origemKey(label) {
  const s = (label || '').toLowerCase();
  if (s.includes('instagram')) return 'instagram';
  if (s.includes('facebook')) return 'facebook';
  if (s.includes('google')) return 'google';
  if (s.includes('meta')) return 'meta';
  if (!s || s === '—' || s.includes('direto')) return 'direto';
  return 'outro';
}
function renderFeed() {
  const el = document.querySelector('[data-feed]'); if (!el) return;
  if (!state.feed.length) { el.innerHTML = `<div class="feed-empty">Nenhum lead rastreado ainda</div>`; return; }
  el.innerHTML = state.feed.map(v => {
    const origem = v.platform || 'Direto';
    return `<div class="feed__item"><span class="feed__nome">${escapeHtml(v.telefone_masked || 'anonimo')}</span><span class="feed__ad" title="${escapeHtml(v.ad_name || '')}">${escapeHtml(v.ad_name || 'sem anuncio')}</span><span class="badge badge--origem" data-src="${origemKey(origem)}"><i class="badge__dot"></i>${escapeHtml(origem)}</span><span class="feed__time">${ago(v.created_at)}</span></div>`;
  }).join('');
}

function renderHealth() {
  const h = state.health; if (!h) return;
  setText('[data-health-meta]', `Meta Ads: ${freshness(h.meta_ads_freshness_min)}`);
  setText('[data-health-utm]', `Rastreio: ${freshness(h.utm_freshness_min)}`);
  const metaEl = document.querySelector('[data-health-meta]');
  if (metaEl) { metaEl.classList.remove('dash-footer__ok', 'dash-footer__warn', 'dash-footer__bad'); const m = h.meta_ads_freshness_min;
    if (m == null) metaEl.classList.add('dash-footer__warn'); else if (m < 70) metaEl.classList.add('dash-footer__ok'); else if (m < 180) metaEl.classList.add('dash-footer__warn'); else metaEl.classList.add('dash-footer__bad'); }
}

// ===== loaders =====
const VALOR_CONSULTA = 2000; // valor fixo da consulta do Dr. Duprat (receita = vendas x este valor)
const P = () => ({ p_client_id: CLIENT_ID, p_ini: state.periodo.ini, p_fim: state.periodo.fim });
async function loadKpis() { state.kpis = await rpc('leadgen_kpis', { ...P(), p_valor_consulta: VALOR_CONSULTA }); state.lastUpdate = Date.now(); renderKpis(); renderHeader(); renderTimeline(); if (state.topAds.length) renderTopAds(); if (state.topAudiences.length) renderTopAudiences(); }
async function loadTimeline() { state.timeline = await rpc('leadgen_timeline', P()); renderTimeline(); }
async function loadTopAds() { state.topAds = await rpc('leadgen_top_ads', { ...P(), p_limit: 10, p_valor_consulta: VALOR_CONSULTA }); renderTopAds(); }
async function loadTopAudiences() { state.topAudiences = await rpc('leadgen_top_audiences', { ...P(), p_limit: 10, p_valor_consulta: VALOR_CONSULTA }); renderTopAudiences(); }
async function loadFunil() { state.funil = await rpc('leadgen_funil', { ...P(), p_valor_consulta: VALOR_CONSULTA }); renderFunil(); }
async function loadHeatmap() { state.heatmap = await rpc('leadgen_heatmap_leads', P()); renderHeatmap(); }
async function loadAtendimento() { state.atend = await rpc('leadgen_atendimento', P()); renderAtendimento(); }
async function loadHealth() { state.health = await rpc('leadgen_health', { p_client_id: CLIENT_ID }); renderHealth(); }
async function loadFeed() { state.feed = await rpc('leadgen_feed', { p_client_id: CLIENT_ID, p_limit: 25 }); renderFeed(); }
function loadPeriodo() { return Promise.allSettled([loadKpis(), loadTimeline(), loadTopAds(), loadTopAudiences(), loadFunil(), loadHeatmap(), loadAtendimento()]); }

// ===== periodo (com sync bidirecional seletor <-> inputs) =====
function syncInputs() {
  const de = document.querySelector('[data-periodo-de]'); const ate = document.querySelector('[data-periodo-ate]');
  if (de) de.value = state.periodo.ini; if (ate) ate.value = state.periodo.fim;
}
function markChip(key) {
  document.querySelectorAll('.periodo__chip').forEach(c => { const active = c.dataset.periodo === key;
    c.classList.toggle('is-active', active); c.setAttribute('aria-selected', active ? 'true' : 'false'); });
}
function applyPeriodo(key, ini, fim, reload = true) {
  state.periodo = { key, ini, fim, label: labelFor(key, ini, fim) };
  markChip(key); syncInputs();
  if (reload) loadPeriodo();
}
function setPreset(key) { const [ini, fim] = rangeFor(key); applyPeriodo(key, ini, fim); }
function bindPeriodo() {
  document.querySelectorAll('.periodo__chip').forEach(chip => chip.addEventListener('click', () => {
    const v = chip.dataset.periodo;
    if (v === 'custom') { markChip('custom'); document.querySelector('[data-periodo-de]')?.focus(); return; }
    setPreset(v);
  }));
  const onInput = () => {
    const de = document.querySelector('[data-periodo-de]')?.value; const ate = document.querySelector('[data-periodo-ate]')?.value;
    if (!de || !ate) return; const ini = de <= ate ? de : ate; const fim = de <= ate ? ate : de;
    applyPeriodo('custom', ini, fim); // editar datas = personalizado (sync inverso)
  };
  document.querySelector('[data-periodo-de]')?.addEventListener('change', onInput);
  document.querySelector('[data-periodo-ate]')?.addEventListener('change', onInput);
}

// ===== polling + realtime =====
function startPolling(fn, ms, label) { let id = null;
  const run = async () => { if (document.hidden) return; try { await fn(); } catch (e) { console.warn(`[${label}]`, e.message); } };
  document.addEventListener('visibilitychange', () => { if (document.hidden) { clearInterval(id); id = null; } else { run(); if (!id) id = setInterval(run, ms); } });
  id = setInterval(run, ms);
}
function setLive(connected) { const el = document.querySelector('[data-live]'); if (!el) return; if (connected) el.removeAttribute('data-disconnected'); else el.setAttribute('data-disconnected', ''); }
function subscribeRealtime() {
  try { const ch = sb.channel('leadgen-utm')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'dr_duprat_utm_tracking' }, () => { loadFeed().catch(() => {}); loadKpis().catch(() => {}); })
    .subscribe((st) => setLive(st === 'SUBSCRIBED'));
    document.addEventListener('visibilitychange', () => { if (!document.hidden && ch.state !== 'joined') ch.unsubscribe().then(() => ch.subscribe()); });
  } catch (e) { console.warn('realtime:', e.message); }
}

// ===== boot =====
async function boot() {
  if (!(await gate())) return;
  bindPeriodo(); bindSortableTables();
  // Periodo padrao: MTD (mes atual). Mas se o mes atual ainda NAO tem venda reportada,
  // cai automaticamente pro mes passado. So decide o padrao no boot -> o usuario troca a vontade.
  let key = 'mtd';
  try {
    const [pi, pf] = rangeFor('mtd');
    const probe = await rpc('leadgen_kpis', { p_client_id: CLIENT_ID, p_ini: pi, p_fim: pf });
    if (!probe || Number(probe.vendas) === 0) key = 'lastmonth';
  } catch (e) { console.warn('probe periodo:', e.message); }
  const [ini, fim] = rangeFor(key);
  state.periodo = { key, ini, fim, label: labelFor(key, ini, fim) };
  markChip(key); syncInputs();
  await Promise.allSettled([loadKpis(), loadTimeline(), loadTopAds(), loadTopAudiences(), loadFunil(), loadHeatmap(), loadAtendimento(), loadHealth(), loadFeed()]);
  subscribeRealtime();
  startPolling(loadKpis, 30_000, 'kpis'); startPolling(loadFeed, 45_000, 'feed'); startPolling(loadHealth, 60_000, 'health');
  startPolling(loadFunil, 300_000, 'funil'); startPolling(loadTopAds, 300_000, 'topads'); startPolling(loadTopAudiences, 300_000, 'topaud');
  startPolling(loadTimeline, 300_000, 'timeline'); startPolling(loadHeatmap, 300_000, 'heatmap'); startPolling(loadAtendimento, 300_000, 'atend');
  setInterval(() => { renderHeader(); }, 1000);
}
document.addEventListener('DOMContentLoaded', boot);
