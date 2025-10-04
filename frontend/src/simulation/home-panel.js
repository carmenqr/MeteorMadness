// src/home-panel.js
// Módulo autocontenido para el panel lateral de información de asteroides

let panelEl = null;
let resetHandlers = new Set();

function ensurePanel() {
  if (panelEl) return panelEl;

  panelEl = document.createElement('div');
  panelEl.id = 'info-panel';
  Object.assign(panelEl.style, {
    position: 'fixed',
    top: '12px',
    left: '12px',
    width: '320px',
    maxHeight: '65vh',
    overflow: 'auto',
    background: 'rgba(11,18,32,.92)',
    color: '#e5e7eb',
    border: '1px solid #ffffff22',
    borderRadius: '12px',
    padding: '12px',
    font: '13px system-ui',
    zIndex: 25,
    display: 'none',
    pointerEvents: 'auto'
  });
  document.body.appendChild(panelEl);

  // Cerrar con ESC
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hidePanel();
  });

  return panelEl;
}

export function initInfoPanel() {
  ensurePanel();
}

export function hidePanel() {
  if (!panelEl) return;
  panelEl.style.display = 'none';
  panelEl.innerHTML = '';
}

export function showPanelFor(item) {
  ensurePanel();
  if (!item) return hidePanel();

  const name = item.mesh?.name ?? item.obj?.name ?? 'Objeto';
  const rows = Object.entries(item.obj || {}).map(([k, v]) => {
    const val = typeof v === 'object' ? JSON.stringify(v) : v;
    return `<div style="margin:2px 0;"><b>${k}</b>: ${val}</div>`;
  }).join('');

  panelEl.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px">
      <div style="font-weight:600">${name}</div>
      <div style="display:flex; gap:6px;">
        <button id="btn-reset"
          style="background:#334155;color:#fff;border:none;border-radius:8px;padding:4px 8px;cursor:pointer">Restaurar</button>
        <button id="btn-close"
          style="background:#172554;color:#fff;border:none;border-radius:8px;padding:4px 8px;cursor:pointer">Cerrar</button>
      </div>
    </div>
    ${rows}
  `;
  panelEl.style.display = 'block';

  const btnReset = panelEl.querySelector('#btn-reset');
  const btnClose = panelEl.querySelector('#btn-close');

  btnReset.onclick = () => {
    // Notificar a home (o quien se suscriba)
    for (const fn of resetHandlers) try { fn(); } catch {}
  };
  btnClose.onclick = () => hidePanel();
}

/** Permite a home.js reaccionar al click en “Restaurar” */
export function onPanelReset(handler) {
  resetHandlers.add(handler);
  return () => resetHandlers.delete(handler);
}
