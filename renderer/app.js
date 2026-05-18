/* ═══════════════════════════════════════════════════════════════════════════
   Orbit — Control Panel Logic
   ═══════════════════════════════════════════════════════════════════════════ */

// ─── Estado Global ────────────────────────────────────────────────────────────
let state = {
  project: {
    name: 'Nuevo Proyecto',
    graphics: [],       // { id, name, filePath, icon, outputId, zIndex, variables, transitionDuration }
    nextId: 1
  },
  activeGraphics: new Set(), // ids de gráficos activos (visibles en output)
  selectedGraphicId: null,
  outputs: [],          // { id, port, url }
  resolution: { w: 1920, h: 1080 }
};

// ─── Inicialización ───────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  // Crear contenedor de toasts
  const toastContainer = document.createElement('div');
  toastContainer.id = 'toast-container';
  document.body.appendChild(toastContainer);

  // Obtener estado del servidor
  await refreshServerStatus();

  // Configurar eventos
  setupTitlebarEvents();
  setupRundownEvents();
  setupPropertiesEvents();
  setupResolutionModal();
  setupTemplatesModal();
  setupDropZone();
  setupTunnelPanel();
  setupPreviewMonitor();

  // Actualizar status cada 5 segundos
  setInterval(refreshServerStatus, 5000);
});

// ─── Estado del Servidor ──────────────────────────────────────────────────────
async function refreshServerStatus() {
  try {
    const status = await window.api.getServerStatus();
    state.outputs = status.outputs;
    state.remoteUrl = status.remote?.url || null;
    renderOutputs();
    updateStatusBar(true, status.outputs, status.remote);
    // Actualizar URL de panel remoto local
    if (status.remote?.url) {
      document.getElementById('local-remote-url').textContent = status.remote.url;
    }
    // Restaurar estado del túnal si estaba activo
    if (status.tunnel) showTunnelOnline(status.tunnel);
  } catch (e) {
    updateStatusBar(false, []);
  }
}

function updateStatusBar(online, outputs, remote) {
  const dot  = document.getElementById('status-server');
  const text = document.getElementById('status-server-text');
  dot.className = `status-dot ${online ? 'online' : 'offline'}`;
  if (online && outputs.length > 0) {
    const urls = outputs.map(o => `localhost:${o.port}`).join(', ');
    const remoteStr = remote ? ` · 📱 ${remote.ip}:${remote.port}` : '';
    text.textContent = `● Outputs: ${urls}${remoteStr}`;
  } else {
    text.textContent = 'Servidor no disponible';
  }
}

// ─── Renderizar Outputs ───────────────────────────────────────────────────────
function renderOutputs() {
  const list = document.getElementById('outputs-list');
  list.innerHTML = '';

  // Actualizar select de outputs en propiedades
  const propOutput = document.getElementById('prop-output');
  const currentVal = propOutput.value;
  propOutput.innerHTML = '<option value="all">Todos los outputs</option>';

  state.outputs.forEach((output, idx) => {
    // Tarjeta
    const card = document.createElement('div');
    card.className = 'output-card';
    card.innerHTML = `
      <div class="output-card-header">
        <span class="output-card-name">Output ${idx + 1}</span>
        <div class="output-status" title="${output.clients} cliente(s) conectado(s)"></div>
      </div>
      <div class="output-url" title="Clic para copiar" data-url="${output.url}">${output.url}</div>
      <div class="output-card-actions">
        <button class="output-copy-btn" data-url="${output.url}">📋 Copiar</button>
        <button class="output-open-btn" data-url="${output.url}">🌐 Abrir</button>
        ${state.outputs.length > 1 ? `<button class="output-remove-btn" data-id="${output.id}">🗑</button>` : ''}
      </div>
    `;
    list.appendChild(card);

    // Select de outputs
    const option = document.createElement('option');
    option.value = output.id;
    option.textContent = `Output ${idx + 1} (${output.url})`;
    propOutput.appendChild(option);
  });

  // Restaurar selección
  if ([...propOutput.options].some(o => o.value === currentVal)) {
    propOutput.value = currentVal;
  }

  // Event listeners de las tarjetas
  list.querySelectorAll('.output-url, .output-copy-btn').forEach(el => {
    el.addEventListener('click', async () => {
      const url = el.dataset.url;
      try {
        await navigator.clipboard.writeText(url);
        showToast('URL copiada al portapapeles', 'success');
      } catch (e) {
        showToast('No se pudo copiar', 'error');
      }
    });
  });

  list.querySelectorAll('.output-open-btn').forEach(el => {
    el.addEventListener('click', () => window.api.openOutputInBrowser(el.dataset.url));
  });

  list.querySelectorAll('.output-remove-btn').forEach(el => {
    el.addEventListener('click', async () => {
      const result = await window.api.removeOutput(parseInt(el.dataset.id));
      if (result.ok) {
        showToast('Output eliminado', 'info');
        await refreshServerStatus();
      } else {
        showToast(result.error || 'Error al eliminar', 'error');
      }
    });
  });
}

// ─── Titlebar Events ──────────────────────────────────────────────────────────
function setupTitlebarEvents() {
  document.getElementById('btn-new-project').addEventListener('click', newProject);
  document.getElementById('btn-load-project').addEventListener('click', loadProject);
  document.getElementById('btn-save-project').addEventListener('click', saveProject);
  document.getElementById('btn-add-output').addEventListener('click', addOutput);
}

async function addOutput() {
  const result = await window.api.addOutput();
  if (result.ok) {
    showToast(`Output ${result.url} agregado`, 'success');
    await refreshServerStatus();
  } else {
    showToast(result.error || 'Error al agregar output', 'error');
  }
}

function newProject() {
  if (!confirm('¿Crear nuevo proyecto? Se perderán los cambios no guardados.')) return;
  state.project = { name: 'Nuevo Proyecto', graphics: [], nextId: 1 };
  state.activeGraphics.clear();
  state.selectedGraphicId = null;
  renderGraphicsList();
  renderProperties();
  updateProjectNameDisplay();
  showToast('Nuevo proyecto creado', 'info');
}

async function loadProject() {
  const result = await window.api.loadProject();
  if (!result) return;
  if (result.error) { showToast('Error al cargar: ' + result.error, 'error'); return; }

  state.project = result.data;
  state.activeGraphics.clear();
  state.selectedGraphicId = null;
  renderGraphicsList();
  renderProperties();
  updateProjectNameDisplay();
  showToast(`Proyecto "${state.project.name}" cargado`, 'success');
}

async function saveProject() {
  const result = await window.api.saveProject(state.project);
  if (result.ok) {
    if (result.name) {
      state.project.name = result.name;
      updateProjectNameDisplay();
    }
    showToast('Proyecto guardado', 'success');
  } else if (result.error) {
    showToast('Error al guardar: ' + result.error, 'error');
  }
}

function updateProjectNameDisplay() {
  document.getElementById('project-name-display').textContent = `— ${state.project.name}`;
}

// ─── Rundown Events ───────────────────────────────────────────────────────────
function setupRundownEvents() {
  document.getElementById('btn-load-files').addEventListener('click', loadHTMLFiles);
  document.getElementById('btn-hide-all').addEventListener('click', hideAllGraphics);
  document.getElementById('btn-load-templates').addEventListener('click', openTemplatesModal);
}

async function loadHTMLFiles() {
  const files = await window.api.openFiles();
  if (!files || files.length === 0) return;

  for (const filePath of files) {
    await addGraphicFromFile(filePath);
  }
  renderGraphicsList();
  syncToRemote();
  showToast(`${files.length} gráfico(s) cargado(s)`, 'success');
}

// ─── Mapa de Variables por Template ──────────────────────────────────────────
const TEMPLATE_VARIABLES = {
  'lower-third-simple': [
    { key: 'nombre', label: '👤 Nombre', value: '', placeholder: 'Ej: Juan Pérez' },
    { key: 'cargo',  label: '💼 Cargo / Título', value: '', placeholder: 'Ej: Director General' }
  ],
  'lower-third-animated': [
    { key: 'nombre', label: '👤 Nombre', value: '', placeholder: 'Ej: María López' },
    { key: 'cargo',  label: '💼 Cargo · Institución', value: '', placeholder: 'Ej: Periodista · Canal 5' }
  ],
  'lower-third-duo': [
    { key: 'nombre1', label: '👤 Nombre Entrevistador', value: '', placeholder: 'Ej: Carlos Ruiz' },
    { key: 'cargo1',  label: '💼 Cargo Entrevistador', value: '', placeholder: 'Ej: Conductor · Noticias' },
    { key: 'nombre2', label: '👤 Nombre Invitado', value: '', placeholder: 'Ej: Ana García' },
    { key: 'cargo2',  label: '💼 Cargo Invitado', value: '', placeholder: 'Ej: Senadora · Congreso' },
    { key: 'rol2',    label: '🏷 Rol del segundo', value: 'Invitado', placeholder: 'Ej: Invitado, Experto...' }
  ],
  'bug-canal': [
    { key: 'canal', label: '📺 Nombre del Canal', value: '', placeholder: 'Ej: MI CANAL TV' },
    { key: 'live',  label: '🔴 Punto en vivo', value: 'true', placeholder: 'true / false' }
  ],
  'ticker': [
    { key: 'texto',    label: '📝 Texto del ticker', value: '', placeholder: 'Ej: Últimas noticias del día...' },
    { key: 'etiqueta', label: '🏷 Etiqueta', value: 'NOTICIAS', placeholder: 'Ej: NOTICIAS, DEPORTES...' },
    { key: 'velocidad',label: '⏩ Velocidad (seg)', value: '20', placeholder: 'Segundos del recorrido' }
  ],
  'timer-countdown': [
    { key: 'modo',     label: '⏱ Modo', value: 'down', placeholder: 'up = cronómetro, down = regresiva' },
    { key: 'inicio',   label: '⏱ Inicio (seg)', value: '300', placeholder: 'Ej: 300 = 5 minutos' },
    { key: 'etiqueta', label: '🏷 Etiqueta', value: 'TIEMPO', placeholder: 'Ej: TIEMPO, REGRESIVA...' },
    { key: 'alerta',   label: '⚠ Alerta amarilla (seg)', value: '30', placeholder: 'Seg para color amarillo' },
    { key: 'peligro',  label: '🔴 Peligro rojo (seg)', value: '10', placeholder: 'Seg para color rojo' }
  ],
  'score-board': [
    { key: 'local',   label: '🏠 Equipo Local', value: '', placeholder: 'Ej: ÁGUILAS' },
    { key: 'visita',  label: '✈ Equipo Visita', value: '', placeholder: 'Ej: LEONES' },
    { key: 'goles_l', label: '⚽ Goles Local', value: '0', placeholder: '0' },
    { key: 'goles_v', label: '⚽ Goles Visita', value: '0', placeholder: '0' },
    { key: 'tiempo',  label: '⏱ Tiempo', value: "45'", placeholder: "Ej: 45', HT, FT" },
    { key: 'deporte', label: '🏷 Deporte/Label', value: 'EN VIVO', placeholder: 'Ej: EN VIVO, 1ER TIEMPO' },
    { key: 'icono_l', label: '🔵 Icono Local', value: '⚽', placeholder: 'Emoji del equipo' },
    { key: 'icono_v', label: '🔴 Icono Visita', value: '⚽', placeholder: 'Emoji del equipo' }
  ],
  'full-screen-title': [
    { key: 'super',    label: '🔝 Texto superior', value: 'Especial', placeholder: 'Ej: Especial, En vivo...' },
    { key: 'titulo',   label: '🎬 Título principal', value: '', placeholder: 'Ej: NOTICIERO NOCTURNO' },
    { key: 'subtitulo',label: '📎 Subtítulo', value: '', placeholder: 'Ej: Edición especial' }
  ],
  'credits': [
    { key: 'seccion1', label: '📋 Sección 1', value: 'Producción', placeholder: 'Ej: Producción' },
    { key: 'nombre1',  label: '👤 Nombre 1', value: '', placeholder: 'Ej: Juan García' },
    { key: 'rol1',     label: '💼 Rol 1', value: '', placeholder: 'Ej: Director' },
    { key: 'nombre2',  label: '👤 Nombre 2', value: '', placeholder: 'Ej: María López' },
    { key: 'rol2',     label: '💼 Rol 2', value: '', placeholder: 'Ej: Productora' },
    { key: 'produccion',label: '🎥 Nombre producción', value: '', placeholder: 'Ej: Mi Productora' }
  ]
};

// Detectar nombre de template desde la ruta del archivo
function detectTemplateName(filePath) {
  const fileName = filePath.split(/[\\/]/).pop().replace('.html', '');
  return TEMPLATE_VARIABLES[fileName] ? fileName : null;
}

// Parsear GDD (Graphics Data Definition) schema de un archivo HTML (H2R compatible)
async function parseGDDSchema(filePath) {
  try {
    const result = await window.api.readHTML(filePath);
    if (!result.ok) return null;
    const html = result.content;
    const gddMatch = html.match(/<script[^>]*type\s*=\s*["']application\/json\+gdd["'][^>]*>([\s\S]*?)<\/script>/i);
    if (!gddMatch) return null;
    const gdd = JSON.parse(gddMatch[1].trim());
    if (!gdd.properties || typeof gdd.properties !== 'object') return null;
    
    const variables = [];
    for (const [key, prop] of Object.entries(gdd.properties)) {
      variables.push({
        key: key,
        label: prop.label || key,
        value: prop.default || '',
        placeholder: prop.default ? `Ej: ${prop.default}` : ''
      });
    }
    return { title: gdd.title || null, variables, isH2R: true };
  } catch (e) {
    console.warn('[GDD] Error parseando schema:', e.message);
    return null;
  }
}

async function detectGenericVariables(filePath) {
  try {
    const result = await window.api.readHTML(filePath);
    if (!result.ok) return [];
    const html = result.content;
    const variables = [];
    
    // Buscar id="f0", id="f1", id="f2"... id="title", id="subtitle"
    const regex = /\bid=['"](f\d+|title|subtitle|name|cargo|info|texto|text\d+)['"]/gi;
    let match;
    const found = new Set();
    while ((match = regex.exec(html)) !== null) {
      const id = match[1].toLowerCase();
      if (!found.has(id)) {
        found.add(id);
        variables.push({
          key: id,
          label: `Texto (${id})`,
          value: '',
          placeholder: 'Escribe aquí...'
        });
      }
    }
    return variables;
  } catch (e) {
    return [];
  }
}

async function detectH2RMode(filePath) {
  try {
    const result = await window.api.readHTML(filePath);
    if (!result.ok) return false;
    const html = result.content;
    return html.includes('function play()') && html.includes('function update(');
  } catch (e) {
    return false;
  }
}

async function addGraphicFromFile(filePath, customName = null) {
  const fileName = filePath.split(/[\\/]/).pop().replace('.html', '');
  const icon = guessIcon(fileName);
  const templateName = detectTemplateName(filePath);

  let variables = [];
  let graphicMode = 'native';
  let detectedName = customName || formatName(fileName);

  if (templateName) {
    // Template conocido de Orbit
    variables = TEMPLATE_VARIABLES[templateName].map(v => ({ ...v }));
  } else {
    // Intentar parsear GDD schema (H2R compatible)
    const gdd = await parseGDDSchema(filePath);
    if (gdd) {
      variables = gdd.variables;
      graphicMode = 'h2r';
      if (gdd.title && !customName) detectedName = gdd.title;
    } else {
      const isH2R = await detectH2RMode(filePath);
      if (isH2R) graphicMode = 'h2r';
      
      variables = await detectGenericVariables(filePath);
    }
  }

  const graphic = {
    id: state.project.nextId++,
    name: detectedName,
    filePath,
    icon,
    templateName: templateName || (graphicMode === 'h2r' ? '__h2r__' : null),
    graphicMode, // 'native' o 'h2r'
    outputId: 'all',
    zIndex: 10,
    variables,
    transitionType: 'fade',
    transitionDuration: 600,
    onScreenDuration: 0,  // segundos en pantalla (0 = manual)
    scale: 1.0,
    posX: 0,
    posY: 0
  };

  state.project.graphics.push(graphic);
  return graphic;
}

function formatName(str) {
  return str.replace(/[-_]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

function guessIcon(name) {
  const n = name.toLowerCase();
  if (n.includes('lower') || n.includes('tercio')) return '📺';
  if (n.includes('bug') || n.includes('logo')) return '🔷';
  if (n.includes('ticker') || n.includes('crawl')) return '📜';
  if (n.includes('timer') || n.includes('cronometro')) return '⏱';
  if (n.includes('credit') || n.includes('credito')) return '🎬';
  if (n.includes('score') || n.includes('marcador')) return '🏆';
  if (n.includes('weather') || n.includes('clima')) return '🌤';
  return '🎨';
}

// ─── Variables para drag and drop ───
let draggedGraphicIdx = null;

// ─── Renderizar Lista de Gráficos ─────────────────────────────────────────────
function renderGraphicsList() {
  const list = document.getElementById('graphics-list');
  list.innerHTML = '';

  // Mostrar/ocultar drop zone
  document.getElementById('drop-zone').style.display =
    state.project.graphics.length === 0 ? 'block' : 'none';

  state.project.graphics.forEach((graphic, idx) => {
    const isActive = state.activeGraphics.has(graphic.id);
    const isSelected = state.selectedGraphicId === graphic.id;

    const card = document.createElement('div');
    card.className = `graphic-card${isSelected ? ' selected' : ''}${isActive ? ' active' : ''}`;
    card.dataset.graphicId = graphic.id;
    card.draggable = true;

    const outputLabel = graphic.outputId === 'all'
      ? 'Todos'
      : `Output ${state.outputs.findIndex(o => o.id === graphic.outputId) + 1}`;

    card.innerHTML = `
      <div class="graphic-card-icon" style="cursor: grab;">${graphic.icon}</div>
      <div class="graphic-card-info">
        <div class="graphic-card-name">${graphic.name}</div>
        <div class="graphic-card-meta">${outputLabel} · Z:${graphic.zIndex}</div>
      </div>
      <div class="graphic-card-actions">
        <button class="btn-trigger ${isActive ? 'btn-out' : 'btn-in'}" data-id="${graphic.id}">
          ${isActive ? 'OUT' : 'IN'}
        </button>
      </div>
    `;

    // Click en la tarjeta → seleccionar
    card.addEventListener('click', (e) => {
      if (e.target.closest('.btn-trigger')) return;
      selectGraphic(graphic.id);
    });

    // Click derecho → eliminar
    card.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (confirm(`¿Eliminar "${graphic.name}"?`)) {
        if (state.activeGraphics.has(graphic.id)) toggleGraphic(graphic.id);
        state.project.graphics = state.project.graphics.filter(x => x.id !== graphic.id);
        if (state.selectedGraphicId === graphic.id) state.selectedGraphicId = null;
        renderGraphicsList();
        renderProperties();
        showToast('Gráfico eliminado', 'info');
      }
    });

    // Click en IN/OUT
    card.querySelector('.btn-trigger').addEventListener('click', (e) => {
      e.stopPropagation();
      toggleGraphic(graphic.id);
    });

    // Eventos Drag and Drop
    card.addEventListener('dragstart', (e) => {
      draggedGraphicIdx = idx;
      e.dataTransfer.effectAllowed = 'move';
      setTimeout(() => card.classList.add('dragging'), 0);
    });

    card.addEventListener('dragend', () => {
      draggedGraphicIdx = null;
      card.classList.remove('dragging');
      list.querySelectorAll('.graphic-card').forEach(c => c.classList.remove('drag-over-top', 'drag-over-bottom'));
    });

    card.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (draggedGraphicIdx === null || draggedGraphicIdx === idx) return;
      
      const bounding = card.getBoundingClientRect();
      const offset = bounding.y + (bounding.height / 2);
      
      card.classList.remove('drag-over-top', 'drag-over-bottom');
      if (e.clientY - offset > 0) {
        card.classList.add('drag-over-bottom');
      } else {
        card.classList.add('drag-over-top');
      }
    });

    card.addEventListener('dragleave', () => {
      card.classList.remove('drag-over-top', 'drag-over-bottom');
    });

    card.addEventListener('drop', (e) => {
      e.preventDefault();
      card.classList.remove('drag-over-top', 'drag-over-bottom');
      if (draggedGraphicIdx === null || draggedGraphicIdx === idx) return;

      const bounding = card.getBoundingClientRect();
      const offset = bounding.y + (bounding.height / 2);
      let targetIdx = idx;
      if (e.clientY - offset > 0) targetIdx++; // Dropped below

      // Adjust index if moving down
      if (draggedGraphicIdx < targetIdx) targetIdx--;

      const item = state.project.graphics.splice(draggedGraphicIdx, 1)[0];
      state.project.graphics.splice(targetIdx, 0, item);

      renderGraphicsList();
      syncToRemote();
    });

    list.appendChild(card);
  });

  renderOnAirVisualizer();
}

function renderOnAirVisualizer() {
  const container = document.getElementById('on-air-visualizer');
  const iframe = document.getElementById('preview-iframe');
  if (!container || !iframe) return;

  container.style.display = 'flex';
  
  if (state.outputs.length > 0 && !iframe.src.includes('localhost')) {
    iframe.src = state.outputs[0].url;
  }
}

function setupPreviewMonitor() {
  const wrapper = document.getElementById('preview-wrapper');
  const iframe = document.getElementById('preview-iframe');
  if (!wrapper || !iframe) return;

  const obs = new ResizeObserver(entries => {
    for (let entry of entries) {
      const rect = entry.contentRect;
      const scale = rect.width / 1920;
      iframe.style.transform = `scale(${scale})`;
    }
  });
  obs.observe(wrapper);
}

// Mapa de timers activos: graphicId -> { timeout, interval, remaining }
const _activeTimers = {};

function startCountdownTimer(graphicId, seconds) {
  clearCountdownTimer(graphicId);

  let remaining = seconds;
  _activeTimers[graphicId] = { remaining };

  // Actualizar la UI del contador cada segundo
  const interval = setInterval(() => {
    remaining--;
    _activeTimers[graphicId].remaining = remaining;
    updateCountdownUI(graphicId, remaining, seconds);
    if (remaining <= 0) clearInterval(interval);
  }, 1000);
  _activeTimers[graphicId].interval = interval;

  // Auto-ocultar al terminar
  const timeout = setTimeout(() => {
    clearCountdownTimer(graphicId);
    toggleGraphic(graphicId); // ocultar
  }, seconds * 1000);
  _activeTimers[graphicId].timeout = timeout;

  // UI inicial
  updateCountdownUI(graphicId, seconds, seconds);
}

function clearCountdownTimer(graphicId) {
  if (_activeTimers[graphicId]) {
    clearTimeout(_activeTimers[graphicId].timeout);
    clearInterval(_activeTimers[graphicId].interval);
    delete _activeTimers[graphicId];
  }
}

function updateCountdownUI(graphicId, remaining, total) {
  const card = document.querySelector(`.graphic-card[data-graphic-id="${graphicId}"]`);
  if (!card) return;

  // Barra de progreso
  let bar = card.querySelector('.graphic-card-timer');
  if (!bar) {
    bar = document.createElement('div');
    bar.className = 'graphic-card-timer';
    card.appendChild(bar);
  }
  const pct = Math.max(0, (remaining / total)) * 100;
  bar.style.width = pct + '%';

  // Contador numérico
  let badge = card.querySelector('.graphic-card-countdown');
  if (!badge) {
    badge = document.createElement('div');
    badge.className = 'graphic-card-countdown';
    // Insertar antes del btn-trigger
    const actions = card.querySelector('.graphic-card-actions');
    if (actions) actions.insertBefore(badge, actions.firstChild);
  }
  badge.textContent = remaining > 0 ? `${remaining}s` : '✓';
  badge.className = 'graphic-card-countdown' +
    (remaining <= 2 ? ' critical' : remaining <= 4 ? ' warning' : '');
}

async function toggleGraphic(graphicId) {
  const graphic = state.project.graphics.find(g => g.id === graphicId);
  if (!graphic) return;

  const isActive = state.activeGraphics.has(graphicId);

  if (!isActive) {
    const variables = {};
    graphic.variables.forEach(v => { if (v.key) variables[v.key] = v.value; });

    const payload = {
      action: 'show',
      graphicId: `gl_${graphicId}`,
      filePath: graphic.filePath,
      variables,
      zIndex: graphic.zIndex,
      outputId: graphic.outputId === 'all' ? null : graphic.outputId,
      transition: { type: graphic.transitionType || 'fade', duration: graphic.transitionDuration },
      layout: { scale: graphic.scale !== undefined ? graphic.scale : 1.0, posX: graphic.posX || 0, posY: graphic.posY || 0 }
    };

    await window.api.triggerGraphic(payload);
    state.activeGraphics.add(graphicId);

    // ⏱ Auto-hide timer
    const dur = graphic.onScreenDuration || 0;
    if (dur > 0) {
      startCountdownTimer(graphicId, dur);
    }
  } else {
    // Cancelar timer si existía
    clearCountdownTimer(graphicId);

    const payload = {
      action: 'hide',
      graphicId: `gl_${graphicId}`,
      outputId: graphic.outputId === 'all' ? null : graphic.outputId,
      transition: { type: graphic.transitionType || 'fade', duration: graphic.transitionDuration }
    };
    await window.api.triggerGraphic(payload);
    state.activeGraphics.delete(graphicId);
  }

  renderGraphicsList();
  syncToRemote();
}

function selectGraphic(id) {
  state.selectedGraphicId = id;
  renderGraphicsList();
  renderProperties();
}

async function hideAllGraphics() {
  const payload = { action: 'hideAll', transition: { duration: 600 } };
  await window.api.triggerGraphic(payload);
  state.activeGraphics.clear();
  renderGraphicsList();
  syncToRemote();
  showToast('Todos los gráficos ocultados', 'info');
}

// Sincronizar estado del proyecto con el panel remoto
function syncToRemote() {
  const graphics = state.project.graphics.map(g => ({
    id: g.id, name: g.name, icon: g.icon,
    filePath: g.filePath, zIndex: g.zIndex,
    variables: g.variables, transitionType: g.transitionType || 'fade', transitionDuration: g.transitionDuration
  }));
  const activeGraphics = [...state.activeGraphics].map(id => `gl_${id}`);
  window.api.syncProject({ graphics, activeGraphics }).catch(() => {});
}

// ─── Properties Panel ─────────────────────────────────────────────────────────
function setupPropertiesEvents() {
  document.getElementById('prop-name').addEventListener('input', (e) => {
    const g = getSelectedGraphic();
    if (!g) return;
    g.name = e.target.value;
    renderGraphicsList();
  });

  document.getElementById('prop-output').addEventListener('change', (e) => {
    const g = getSelectedGraphic();
    if (!g) return;
    g.outputId = e.target.value === 'all' ? 'all' : parseInt(e.target.value);
    renderGraphicsList();
  });

  document.getElementById('prop-zindex').addEventListener('input', (e) => {
    const g = getSelectedGraphic();
    if (!g) return;
    g.zIndex = parseInt(e.target.value) || 10;
    renderGraphicsList();
  });

  document.getElementById('prop-scale').addEventListener('input', (e) => {
    const g = getSelectedGraphic();
    if (!g) return;
    g.scale = parseFloat(e.target.value) || 1.0;
    sendUpdateIfActive(g);
  });

  document.getElementById('prop-posx').addEventListener('input', (e) => {
    const g = getSelectedGraphic();
    if (!g) return;
    g.posX = parseInt(e.target.value) || 0;
    sendUpdateIfActive(g);
  });

  document.getElementById('prop-posy').addEventListener('input', (e) => {
    const g = getSelectedGraphic();
    if (!g) return;
    g.posY = parseInt(e.target.value) || 0;
    sendUpdateIfActive(g);
  });

  document.getElementById('prop-transition-type').addEventListener('change', (e) => {
    const g = getSelectedGraphic();
    if (!g) return;
    g.transitionType = e.target.value;
  });

  document.getElementById('prop-transition').addEventListener('change', (e) => {
    const g = getSelectedGraphic();
    if (!g) return;
    g.transitionDuration = parseInt(e.target.value);
  });

  // Auto-hide timer: input manual
  document.getElementById('prop-duration').addEventListener('input', (e) => {
    const g = getSelectedGraphic();
    if (!g) return;
    const val = Math.max(0, parseInt(e.target.value) || 0);
    g.onScreenDuration = val;
    updateTimerPresetUI(val);
    updateTimerHint(val);
  });

  // Auto-hide timer: botones preset
  document.querySelectorAll('.timer-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      const g = getSelectedGraphic();
      if (!g) return;
      const val = parseInt(btn.dataset.val);
      g.onScreenDuration = val;
      document.getElementById('prop-duration').value = val;
      updateTimerPresetUI(val);
      updateTimerHint(val);
    });
  });

  document.getElementById('btn-add-variable').addEventListener('click', () => {
    const g = getSelectedGraphic();
    if (!g) return;
    const nextIdx = g.variables.length;
    g.variables.push({ key: `f${nextIdx}`, label: `Texto extra ${nextIdx + 1}`, value: '' });
    renderVariables(g);
  });

  document.getElementById('btn-remove-graphic').addEventListener('click', () => {
    const g = getSelectedGraphic();
    if (!g) return;
    if (!confirm(`¿Eliminar "${g.name}"?`)) return;
    // Ocultar si está activo
    if (state.activeGraphics.has(g.id)) toggleGraphic(g.id);
    state.project.graphics = state.project.graphics.filter(x => x.id !== g.id);
    state.selectedGraphicId = null;
    renderGraphicsList();
    renderProperties();
    showToast('Gráfico eliminado', 'info');
  });
}

function renderProperties() {
  const g = getSelectedGraphic();
  const form = document.getElementById('prop-form');
  const noSel = document.getElementById('no-selection-msg');

  if (!g) {
    form.style.display = 'none';
    noSel.style.display = 'flex';
    return;
  }

  form.style.display = 'block';
  noSel.style.display = 'none';

  document.getElementById('prop-name').value = g.name;
  document.getElementById('prop-zindex').value = g.zIndex;
  document.getElementById('prop-scale').value = g.scale !== undefined ? g.scale : 1.0;
  document.getElementById('prop-posx').value = g.posX || 0;
  document.getElementById('prop-posy').value = g.posY || 0;
  document.getElementById('prop-transition-type').value = g.transitionType || 'fade';
  document.getElementById('prop-transition').value = g.transitionDuration;
  document.getElementById('prop-duration').value = g.onScreenDuration || 0;

  // Timer presets UI
  updateTimerPresetUI(g.onScreenDuration || 0);
  updateTimerHint(g.onScreenDuration || 0);

  // Output select
  const propOutput = document.getElementById('prop-output');
  propOutput.value = g.outputId === 'all' ? 'all' : g.outputId;

  // Update variables hint
  const hint = document.getElementById('variables-hint');
  if (g.templateName && TEMPLATE_VARIABLES[g.templateName]) {
    hint.textContent = 'Llena los campos para que aparezcan en pantalla';
    hint.style.color = 'var(--accent-h)';
  } else {
    hint.textContent = 'Agrega variables clave=valor para personalizar el gráfico';
    hint.style.color = '';
  }

  renderVariables(g);
}

function updateTimerPresetUI(val) {
  document.querySelectorAll('.timer-preset').forEach(btn => {
    btn.classList.toggle('active', parseInt(btn.dataset.val) === val);
  });
}

function updateTimerHint(val) {
  const hint = document.getElementById('timer-hint');
  if (val === 0) {
    hint.textContent = 'Manual: se oculta al presionar OUT';
    hint.className = 'timer-hint';
  } else {
    hint.textContent = `Auto: se ocultará a los ${val} seg de aparecer`;
    hint.className = 'timer-hint active-timer';
  }
}

function renderVariables(g) {
  const container = document.getElementById('variables-container');
  container.innerHTML = '';

  const isTemplate = g.templateName && TEMPLATE_VARIABLES[g.templateName];

  g.variables.forEach((v, idx) => {
    const row = document.createElement('div');
    row.className = 'variable-row';

    if (v.label || isTemplate) {
      // Modo template: inputs amigables con labels
      row.className = 'variable-row template-var';
      row.innerHTML = `
        <div class="var-label-row">
          <label class="var-friendly-label">${escHtml(v.label)}</label>
          <button class="btn-remove-var" data-idx="${idx}" title="Eliminar">✕</button>
        </div>
        <input type="text"
               class="var-friendly-input"
               placeholder="${escHtml(v.placeholder || '')}"
               value="${escHtml(v.value)}"
               data-idx="${idx}"
               data-field="value">
      `;
      // Solo el campo value es editable; key es fijo
      row.querySelector('.var-friendly-input').addEventListener('input', (e) => {
        g.variables[parseInt(e.target.dataset.idx)].value = e.target.value;
        sendUpdateIfActive(g);
      });
    } else {
      // Modo genérico: clave = valor
      row.innerHTML = `
        <input type="text" placeholder="nombre" value="${escHtml(v.key)}" data-idx="${idx}" data-field="key">
        <span class="var-sep">=</span>
        <input type="text" placeholder="valor" value="${escHtml(v.value)}" data-idx="${idx}" data-field="value">
        <button class="btn-remove-var" data-idx="${idx}" title="Eliminar">✕</button>
      `;
      row.querySelectorAll('input').forEach(inp => {
        inp.addEventListener('input', (e) => {
          const field = e.target.dataset.field;
          g.variables[parseInt(e.target.dataset.idx)][field] = e.target.value;
          sendUpdateIfActive(g);
        });
      });
    }

    row.querySelector('.btn-remove-var').addEventListener('click', (e) => {
      g.variables.splice(parseInt(e.target.dataset.idx), 1);
      renderVariables(g);
    });

    container.appendChild(row);
  });
}

function getSelectedGraphic() {
  if (state.selectedGraphicId === null) return null;
  return state.project.graphics.find(g => g.id === state.selectedGraphicId) || null;
}

function sendUpdateIfActive(g) {
  if (state.activeGraphics.has(g.id)) {
    const variables = {};
    g.variables.forEach(v => { if (v.key) variables[v.key] = v.value; });
    const payload = {
      action: 'update',
      graphicId: `gl_${g.id}`,
      variables,
      layout: { scale: g.scale !== undefined ? g.scale : 1.0, posX: g.posX || 0, posY: g.posY || 0 }
    };
    window.api.triggerGraphic(payload);
  }
  syncToRemote();
}

// ─── Drop Zone ────────────────────────────────────────────────────────────────
function setupDropZone() {
  const dropZone = document.getElementById('drop-zone');
  const body = document.body;

  dropZone.addEventListener('click', () => {
    loadHTMLFiles();
  });

  body.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });

  body.addEventListener('dragleave', (e) => {
    if (!e.relatedTarget) dropZone.classList.remove('dragover');
  });

  body.addEventListener('drop', async (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    const files = [...e.dataTransfer.files].filter(f => f.name.endsWith('.html'));
    if (files.length === 0) { showToast('Solo se aceptan archivos .html', 'error'); return; }
    for (const f of files) {
      await addGraphicFromFile(f.path);
    }
    renderGraphicsList();
    syncToRemote();
    showToast(`${files.length} gráfico(s) cargado(s)`, 'success');
  });
}

// ─── Modal: Resolución ────────────────────────────────────────────────────────
function setupResolutionModal() {
  document.getElementById('btn-resolution').addEventListener('click', () => {
    document.getElementById('modal-resolution').style.display = 'flex';
  });

  document.getElementById('close-resolution').addEventListener('click', () => {
    document.getElementById('modal-resolution').style.display = 'none';
  });

  document.querySelectorAll('.res-btn:not(.custom-btn)').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.res-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('custom-res').style.display = 'none';

      if (btn.dataset.w === 'custom') return;

      const w = parseInt(btn.dataset.w);
      const h = parseInt(btn.dataset.h);
      setResolution(w, h);
    });
  });

  document.querySelector('.custom-btn').addEventListener('click', () => {
    document.getElementById('custom-res').style.display = 'block';
    document.querySelectorAll('.res-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('.custom-btn').classList.add('active');
  });

  document.getElementById('btn-apply-custom-res').addEventListener('click', () => {
    const w = parseInt(document.getElementById('custom-w').value);
    const h = parseInt(document.getElementById('custom-h').value);
    if (!w || !h || w < 320 || h < 240) { showToast('Resolución inválida', 'error'); return; }
    setResolution(w, h);
  });

  document.getElementById('modal-resolution').querySelector('.modal-backdrop')
    .addEventListener('click', () => {
      document.getElementById('modal-resolution').style.display = 'none';
    });
}

function setResolution(w, h) {
  state.resolution = { w, h };
  document.getElementById('status-resolution').textContent = `${w}×${h}`;
  document.getElementById('modal-resolution').style.display = 'none';
  showToast(`Resolución configurada: ${w}×${h}`, 'success');
}

// ─── Modal: Templates ─────────────────────────────────────────────────────────
function setupTemplatesModal() {
  document.getElementById('close-templates').addEventListener('click', () => {
    document.getElementById('modal-templates').style.display = 'none';
  });

  document.getElementById('modal-templates').querySelector('.modal-backdrop')
    .addEventListener('click', () => {
      document.getElementById('modal-templates').style.display = 'none';
    });
}

async function openTemplatesModal() {
  const templates = await window.api.listTemplates();
  const grid = document.getElementById('templates-grid');
  grid.innerHTML = '';

  const templatesMeta = {
    'lower-third-simple':   { icon: '📺', desc: 'Tercio básico con nombre y cargo' },
    'lower-third-animated': { icon: '✨', desc: 'Tercio con animación reveal' },
    'lower-third-duo':      { icon: '👥', desc: 'Dos personas — Entrevista' },
    'bug-canal':            { icon: '🔷', desc: 'Bug/logo de canal esquina superior' },
    'ticker':               { icon: '📜', desc: 'Ticker de noticias inferior' },
    'timer-countdown':      { icon: '⏱', desc: 'Cronómetro / Cuenta regresiva' },
    'score-board':          { icon: '🏆', desc: 'Marcador deportivo animado' },
    'full-screen-title':    { icon: '🎬', desc: 'Título cinemático pantalla completa' },
    'credits':              { icon: '🎭', desc: 'Créditos animados con scroll' },
  };

  if (templates.length === 0) {
    grid.innerHTML = '<p style="color:var(--text-3);padding:20px;text-align:center">No hay templates disponibles</p>';
  }

  templates.forEach(t => {
    const meta = templatesMeta[t.name] || { icon: '🎨', desc: 'Template personalizado' };
    const card = document.createElement('div');
    card.className = 'template-card';
    card.innerHTML = `
      <div class="template-card-icon">${meta.icon}</div>
      <div class="template-card-name">${formatName(t.name)}</div>
      <div class="template-card-desc">${meta.desc}</div>
    `;
    card.addEventListener('click', async () => {
      await addGraphicFromFile(t.path, formatName(t.name));
      renderGraphicsList();
      syncToRemote();
      document.getElementById('modal-templates').style.display = 'none';
      showToast(`Template "${formatName(t.name)}" agregado`, 'success');
    });
    grid.appendChild(card);
  });

  document.getElementById('modal-templates').style.display = 'flex';
}

// ─── Toast Notifications ──────────────────────────────────────────────────────
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('toast-out');
    setTimeout(() => toast.remove(), 260);
  }, 2500);
}

// ─── Utilidades ───────────────────────────────────────────────────────────────
function escHtml(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── Túnel Público ────────────────────────────────────────────────────────────
function setupTunnelPanel() {
  const btnStart = document.getElementById('btn-tunnel-start');
  const btnStop  = document.getElementById('btn-tunnel-stop');
  const btnQr    = document.getElementById('btn-tunnel-qr');
  const btnCopy  = document.getElementById('btn-tunnel-copy-out');
  const btnLocalQr = document.getElementById('btn-local-remote-qr');

  btnStart.addEventListener('click', async () => {
    btnStart.disabled = true;
    btnStart.textContent = '⏳ Conectando...';
    try {
      const result = await window.api.startTunnel();
      if (result.ok) {
        showTunnelOnline(result);
        showToast('🌐 Túnel activo — acceso global', 'success');
      } else {
        showToast('Error: ' + (result.error || 'No pudo iniciarse'), 'error');
        btnStart.disabled = false;
        btnStart.textContent = '🌐 Activar Túnel Público';
      }
    } catch (e) {
      showToast('Error al iniciar túnel', 'error');
      btnStart.disabled = false;
      btnStart.textContent = '🌐 Activar Túnel Público';
    }
  });

  btnStop.addEventListener('click', async () => {
    await window.api.stopTunnel();
    showTunnelOffline();
    showToast('Túnel detenido', 'info');
  });

  btnQr.addEventListener('click', () => {
    const url = document.getElementById('tunnel-remote-url').textContent;
    openQrModal('Panel Remoto — Acceso Global', url,
      'Escanea desde el celular del operador — funciona en cualquier lugar del mundo');
  });

  btnCopy.addEventListener('click', async () => {
    const url = document.getElementById('tunnel-output-url').textContent;
    try {
      await navigator.clipboard.writeText(url);
      showToast('URL copiada', 'success');
    } catch(e) {
      showToast('No se pudo copiar', 'error');
    }
  });

  btnLocalQr.addEventListener('click', () => {
    const url = document.getElementById('local-remote-url').textContent;
    openQrModal('Panel Remoto — Red Local', url,
      'Solo funciona si el celular está en la misma red WiFi');
  });

  // Click en URL del túnel → copiar
  document.getElementById('tunnel-output-url').addEventListener('click', async function() {
    try { await navigator.clipboard.writeText(this.textContent); showToast('Copiado', 'success'); } catch(e){}
  });
  document.getElementById('tunnel-remote-url').addEventListener('click', async function() {
    try { await navigator.clipboard.writeText(this.textContent); showToast('Copiado', 'success'); } catch(e){}
  });
  document.getElementById('local-remote-url').addEventListener('click', async function() {
    try { await navigator.clipboard.writeText(this.textContent); showToast('Copiado', 'success'); } catch(e){}
  });

  // QR modal close
  document.getElementById('close-qr').addEventListener('click', () => {
    document.getElementById('modal-qr').style.display = 'none';
  });
  document.getElementById('modal-qr').querySelector('.modal-backdrop')
    .addEventListener('click', () => {
      document.getElementById('modal-qr').style.display = 'none';
    });
}

function showTunnelOnline(result) {
  document.getElementById('tunnel-offline').style.display = 'none';
  document.getElementById('tunnel-online').style.display = 'flex';
  document.getElementById('tunnel-output-url').textContent = result.outputUrl || result.url;
  document.getElementById('tunnel-remote-url').textContent = result.remoteUrl || (result.url + '/remote');
}

function showTunnelOffline() {
  document.getElementById('tunnel-online').style.display = 'none';
  document.getElementById('tunnel-offline').style.display = 'flex';
  const btn = document.getElementById('btn-tunnel-start');
  btn.disabled = false;
  btn.textContent = '🌐 Activar Túnel Público';
}

// ─── Modal QR Code ────────────────────────────────────────────────────────────
function openQrModal(title, url, desc) {
  if (!url || url === 'Detectando...') {
    showToast('URL no disponible', 'error');
    return;
  }
  document.getElementById('qr-modal-title').textContent = title;
  document.getElementById('qr-modal-desc').textContent = desc || '';
  document.getElementById('qr-url-display').textContent = url;
  generateQR(url);
  document.getElementById('modal-qr').style.display = 'flex';
}

async function generateQR(text) {
  const canvas = document.getElementById('qr-canvas');
  const ctx = canvas.getContext('2d');
  const size = 220;
  canvas.width = size;
  canvas.height = size;

  // Fallback visual mientras carga
  ctx.fillStyle = '#0a0a10';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#7c3aed';
  ctx.font = 'bold 13px Inter,sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Cargando QR...', size/2, size/2);

  try {
    const result = await window.api.generateQR(text);
    if (result.ok && result.dataUrl) {
      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, size, size);
        ctx.drawImage(img, 0, 0, size, size);
      };
      img.src = result.dataUrl;
    } else {
      throw new Error(result.error);
    }
  } catch (e) {
    ctx.fillStyle = '#0a0a10';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#ef4444';
    ctx.fillText('Error al cargar QR', size/2, size/2);
    console.error('QR Error:', e);
  }
}

