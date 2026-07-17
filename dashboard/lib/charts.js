// charts.js — factories Chart.js (Dr. Duprat · navy/ambar/creme)

const C = {
  green950: '#0B0D0F',
  green900: '#101315',
  green800: '#171B1E',
  green700: '#20262A',
  green600: '#2B3237',
  gold700: '#B07E1E',
  gold500: '#D9A32E',
  gold400: '#F4BB42',
  gold300: '#F8D27B',
  cream: '#F5F3EF',
  cream2: '#D8D6D0',
  cream3: '#9A9C9E',
  terracotta: '#C56B4A',
  fontUi: '"Montserrat", system-ui, -apple-system, sans-serif',
  fontDisplay: '"Montserrat", Georgia, serif'
};

function applyDefaults() {
  if (!window.Chart) return;
  const Ch = window.Chart;
  Ch.defaults.color = C.cream2;
  Ch.defaults.font.family = C.fontUi;
  Ch.defaults.font.size = 11;
  Ch.defaults.borderColor = 'rgba(244,187,66,0.15)';
  Ch.defaults.plugins.legend.labels.color = C.cream2;
  Ch.defaults.plugins.tooltip.backgroundColor = C.green800;
  Ch.defaults.plugins.tooltip.titleColor = C.cream;
  Ch.defaults.plugins.tooltip.bodyColor = C.cream;
  Ch.defaults.plugins.tooltip.borderColor = 'rgba(244,187,66,0.35)';
  Ch.defaults.plugins.tooltip.borderWidth = 1;
  Ch.defaults.plugins.tooltip.padding = 10;
  Ch.defaults.plugins.tooltip.cornerRadius = 8;
}
applyDefaults();

const baseGrid = { color: 'rgba(244,187,66,0.08)', drawBorder: false };
const baseTicks = { color: C.cream3, font: { family: C.fontUi, size: 10 } };

// Leads/dia: barra leads (dourado) + linha vendas (verde claro) + linha investimento (terracota)
export function makeLeadsChart(canvas, { labels, leads, invest, vendas, hojeIdx = -1 }) {
  const datasets = [
    {
      type: 'bar', label: 'Leads/dia', data: leads,
      backgroundColor: leads.map((_, i) => i === hojeIdx ? C.gold400 : 'rgba(244,187,66,0.55)'),
      borderColor: C.gold500, borderWidth: 0, borderRadius: 3, maxBarThickness: 22, yAxisID: 'y', order: 3
    },
    {
      type: 'line', label: 'Vendas/dia', data: vendas,
      borderColor: C.gold300, backgroundColor: 'rgba(248,210,123,0.10)',
      borderWidth: 2, tension: 0.3, pointRadius: 0, pointHoverRadius: 4, yAxisID: 'y', order: 1
    },
    {
      type: 'line', label: 'Investimento (R$)', data: invest,
      borderColor: C.terracotta, backgroundColor: 'transparent',
      borderWidth: 1.5, tension: 0.25, pointRadius: 0, pointHoverRadius: 4, yAxisID: 'y1', order: 2
    }
  ];
  return new window.Chart(canvas, {
    data: { labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false, animation: { duration: 400 },
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { display: true, position: 'top', align: 'end' } },
      scales: {
        x: { grid: baseGrid, ticks: { ...baseTicks, maxRotation: 0, autoSkip: true, maxTicksLimit: 12 } },
        y: { beginAtZero: true, grid: baseGrid, ticks: { ...baseTicks, precision: 0 },
             title: { display: true, text: 'Leads / Vendas', color: C.gold500, font: { size: 10 } } },
        y1: { beginAtZero: true, position: 'right', grid: { display: false },
              ticks: { ...baseTicks, color: C.terracotta, callback: v => 'R$' + v.toLocaleString('pt-BR') },
              title: { display: true, text: 'Investimento', color: C.terracotta, font: { size: 10 } } }
      }
    }
  });
}

export function makeSparkline(canvas, data, color) {
  color = color || C.gold500;
  return new window.Chart(canvas, {
    type: 'line',
    data: { labels: data.map((_, i) => i), datasets: [{
      data, borderColor: color, backgroundColor: 'rgba(244,187,66,0.10)',
      fill: true, borderWidth: 1.2, pointRadius: 0, tension: 0.3 }] },
    options: { responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      scales: { x: { display: false }, y: { display: false } }, animation: { duration: 0 } }
  });
}

export const COLORS = C;
