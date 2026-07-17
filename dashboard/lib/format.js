// format.js — helpers de formatacao BRT, BRL, percent, abrev
const TZ = 'America/Sao_Paulo';

export const brl = (v, opts = {}) => {
  if (v === null || v === undefined || Number.isNaN(+v)) return '—';
  const n = +v;
  if (opts.compact && Math.abs(n) >= 1000) {
    return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 });
  }
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: opts.cents === false ? 0 : 2, maximumFractionDigits: opts.cents === false ? 0 : 2 });
};

export const num = (v, opts = {}) => {
  if (v === null || v === undefined) return '—';
  const n = +v;
  if (opts.compact && Math.abs(n) >= 1000) {
    return n.toLocaleString('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });
  }
  return n.toLocaleString('pt-BR', { maximumFractionDigits: opts.decimals ?? 0 });
};

export const pct = (v, decimals = 1) => {
  if (v === null || v === undefined) return '—';
  return `${(+v).toLocaleString('pt-BR', { maximumFractionDigits: decimals, minimumFractionDigits: decimals })}%`;
};

// "ha 3 min", "ha 2h", "ha 1d"
export const ago = (iso) => {
  if (!iso) return '—';
  const ms = typeof iso === 'number' ? iso : new Date(iso).getTime();
  const sec = Math.max(0, (Date.now() - ms) / 1000);
  if (sec < 60) return `ha ${Math.floor(sec)}s`;
  if (sec < 3600) return `ha ${Math.floor(sec / 60)} min`;
  if (sec < 86400) return `ha ${Math.floor(sec / 3600)}h`;
  return `ha ${Math.floor(sec / 86400)}d`;
};

// "10/05 14:32" — sempre BRT
export const dateBRT = (iso) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', {
    timeZone: TZ, day: '2-digit', month: '2-digit',
    hour: '2-digit', minute: '2-digit'
  }).replace(',', '');
};

// "14:32:18" — so hora BRT
export const timeBRT = (iso) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('pt-BR', {
    timeZone: TZ, hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
};

// Diff em minutos formatado: 47 -> "47 min", 90 -> "1h30", 1440 -> "1d"
export const freshness = (mins) => {
  if (mins === null || mins === undefined) return '—';
  const m = Math.floor(+mins);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), rem = m % 60;
  if (h < 24) return rem ? `${h}h${rem}` : `${h}h`;
  return `${Math.floor(h / 24)}d`;
};

// Delta percentual com sinal: hoje=10, ontem=8 -> +25.0%
export const delta = (atual, anterior) => {
  if (!anterior || anterior === 0) return atual > 0 ? '+100%' : '0%';
  const d = ((atual - anterior) / anterior) * 100;
  const sign = d > 0 ? '+' : '';
  return `${sign}${d.toFixed(1)}%`;
};

export const TZ_BRT = TZ;
