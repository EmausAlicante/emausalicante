/* ============================================================
   Emaús · Gestión de retiros — interfaz (v1)
   ============================================================ */

function esc(s) {
  return String(s == null ? '' : s)
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function fmtCorto(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/* ---------- CSV: exportar/importar (soporta , o ; como separador, para Excel en español) ---------- */
function csvStringify(cabeceras, filas) {
  const linea = campos => campos.map(v => {
    const s = v == null ? '' : String(v);
    return /[",\n;]/.test(s) ? '"' + s.replaceAll('"', '""') + '"' : s;
  }).join(',');
  return '﻿' + [linea(cabeceras), ...filas.map(linea)].join('\r\n');
}

function csvParse(texto) {
  const limpio = texto.replace(/^﻿/, '');
  const sep = (limpio.slice(0, limpio.indexOf('\n')).match(/;/g) || []).length >
              (limpio.slice(0, limpio.indexOf('\n')).match(/,/g) || []).length ? ';' : ',';
  const filas = [];
  let fila = [], campo = '', enComillas = false;
  for (let i = 0; i < limpio.length; i++) {
    const c = limpio[i];
    if (enComillas) {
      if (c === '"' && limpio[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') { enComillas = false; }
      else campo += c;
    } else if (c === '"') { enComillas = true; }
    else if (c === sep) { fila.push(campo); campo = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && limpio[i + 1] === '\n') i++;
      fila.push(campo); campo = '';
      if (fila.some(x => x !== '')) filas.push(fila);
      fila = [];
    } else campo += c;
  }
  if (campo !== '' || fila.length) { fila.push(campo); if (fila.some(x => x !== '')) filas.push(fila); }
  if (!filas.length) return [];
  const cabeceras = filas[0].map(h => h.trim());
  return filas.slice(1).map(f => Object.fromEntries(cabeceras.map((h, i) => [h, (f[i] || '').trim()])));
}

function descargarCSV(nombreArchivo, cabeceras, filas) {
  const blob = new Blob([csvStringify(cabeceras, filas)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nombreArchivo;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

const App = {
  ui: { vista: 'panel', zonaId: 'all', retiroId: null, buscar: '', formOk: null, equipoAnio: null, menuAbierto: false, tesTipo: 'ingreso' },

  init() {
    Store.cargar();
    this.render();
  },

  ir(vista) {
    this.ui.vista = vista;
    this.ui.retiroId = null;
    this.ui.actividadId = null;
    this.ui.formOk = null;
    this.ui.menuAbierto = false;
    this.render();
  },

  // Menú de móvil: sin argumento alterna, con argumento fuerza ese estado (true/false)
  toggleMenu(valor) {
    this.ui.menuAbierto = typeof valor === 'boolean' ? valor : !this.ui.menuAbierto;
    this.render();
  },

  setZona(id) {
    if (id === '__nueva__') {
      const z = this.pedirNuevaZona();
      if (z) this.ui.zonaId = z.id;
      this.render();
      return;
    }
    this.ui.zonaId = id;
    this.render();
  },

  // Crea una zona si no existe (o devuelve la existente con ese nombre)
  pedirNuevaZona() {
    const nombre = (prompt('Nombre de la nueva zona (provincia o localidad):') || '').trim();
    if (!nombre) return null;
    const existe = Store.db.zonas.find(z => z.nombre.toLowerCase() === nombre.toLowerCase());
    if (existe) { alert(`La zona «${existe.nombre}» ya existe: se usará esa.`); return existe; }
    const tipo = confirm(`¿«${nombre}» es una provincia?\n\nAceptar = provincia · Cancelar = localidad`) ? 'provincia' : 'localidad';
    return Store.nuevaZona(nombre, tipo);
  },

  // Para los desplegables de zona con la opción "➕ Crear nueva zona…"
  zonaSelectCambio(sel) {
    if (sel.value !== '__nueva__') return;
    const z = this.pedirNuevaZona();
    if (z) {
      const optNueva = sel.querySelector('option[value="__nueva__"]');
      if (!sel.querySelector(`option[value="${z.id}"]`)) {
        optNueva.insertAdjacentHTML('beforebegin', `<option value="${z.id}">${esc(z.nombre)}</option>`);
      }
      sel.value = z.id;
    } else {
      sel.selectedIndex = 0;
    }
  },
  setBuscar(txt) { this.ui.buscar = txt; this.render(); },

  /* Qué ve cada rol en el menú lateral. 'coordinador' (o si el rol no
     se pudo determinar, por seguridad de UI) ve todo; el resto, solo su área. */
  vistasPorRol() {
    const TODAS = [
      ['panel', '📊 Panel'],
      ['contactos', '👥 Contactos'],
      ['equipo', '⭐ Equipo de zona'],
      ['retiros', '🕊️ Retiros'],
      ['actividades', '📅 Actividades'],
      ['inventario', '🧥 Material'],
      ['tesoreria', '💶 Tesorería'],
      ['formulario', '📝 Formulario público'],
      ['ajustes', '⚙️ Ajustes y plantillas']
    ];
    if (Store.miRol === 'material') return [['inventario', '🧥 Material']];
    if (Store.miRol === 'actividades') return [['actividades', '📅 Actividades']];
    if (Store.miRol === 'tesoreria') return [['tesoreria', '💶 Tesorería']];
    return TODAS; // coordinador, o rol desconocido (la seguridad real la da RLS, no este menú)
  },

  /* ============ Render raíz ============ */
  render() {
    const vistas = this.vistasPorRol();
    if (!vistas.some(([id]) => id === this.ui.vista)) this.ui.vista = vistas[0][0];
    const nav = vistas.map(([id, nombre]) =>
      `<button class="${this.ui.vista === id ? 'activo' : ''}" onclick="App.ir('${id}')">${nombre}</button>`
    ).join('');

    const zonas = Store.db.zonas.map(z =>
      `<option value="${z.id}" ${this.ui.zonaId === z.id ? 'selected' : ''}>${esc(z.nombre)} (${z.tipo})</option>`
    ).join('');

    // Subtítulo de la barra: el retiro abierto, si no la zona elegida, si no el genérico
    const retiroAbierto = this.ui.vista === 'retiros' && this.ui.retiroId ? Store.retiro(this.ui.retiroId) : null;
    const zonaElegida = this.ui.zonaId !== 'all' ? Store.zona(this.ui.zonaId) : null;
    const subtitulo = retiroAbierto ? retiroAbierto.nombre : (zonaElegida ? zonaElegida.nombre : 'Gestión de retiros');
    const logo = Store.db.organizacion.logo;

    let contenido = '';
    if (this.ui.vista === 'panel') contenido = this.vPanel();
    else if (this.ui.vista === 'contactos') contenido = this.vContactos();
    else if (this.ui.vista === 'equipo') contenido = this.vEquipo();
    else if (this.ui.vista === 'retiros') contenido = this.ui.retiroId ? this.vRetiroDetalle() : this.vRetiros();
    else if (this.ui.vista === 'actividades') contenido = this.ui.actividadId ? this.vActividadDetalle() : this.vActividades();
    else if (this.ui.vista === 'inventario') contenido = this.vInventario();
    else if (this.ui.vista === 'tesoreria') contenido = this.vTesoreria();
    else if (this.ui.vista === 'formulario') contenido = this.vFormulario();
    else if (this.ui.vista === 'ajustes') contenido = this.vAjustes();

    document.getElementById('app').innerHTML = `
      <button class="menu-toggle" onclick="App.toggleMenu()" aria-label="Abrir menú">☰</button>
      <div class="fondo-menu ${this.ui.menuAbierto ? 'visible' : ''}" onclick="App.toggleMenu(false)"></div>
      <aside class="sidebar ${this.ui.menuAbierto ? 'abierto' : ''}">
        <div class="logo">
          ${logo ? `<img src="${logo}" alt="Logotipo">` : ''}
          <h1>Emaús</h1><span>${esc(subtitulo)}</span>
        </div>
        <nav>${nav}</nav>
        <div class="pie">v1 · datos de ejemplo<br>${esc(Store.db.organizacion.nombre)}</div>
      </aside>
      <div class="main">
        <div class="cabecera">
          <div>
            <h2 id="titulo-vista"></h2>
            <div class="org">${esc(Store.db.organizacion.nombre)}</div>
          </div>
          <div>
            <label>Zona</label>
            <select onchange="App.setZona(this.value)">
              <option value="all" ${this.ui.zonaId === 'all' ? 'selected' : ''}>Todas las zonas</option>
              ${zonas}
              <option value="__nueva__">➕ Nueva zona…</option>
            </select>
          </div>
        </div>
        ${contenido}
      </div>`;

    const titulos = {
      panel: 'Panel', contactos: 'Contactos', equipo: 'Equipo de zona',
      retiros: this.ui.retiroId ? 'Detalle del retiro' : 'Retiros',
      actividades: this.ui.actividadId ? 'Detalle de la actividad' : 'Actividades del año',
      inventario: 'Material · stock y pedidos',
      formulario: 'Formulario público de inscripción', ajustes: 'Ajustes y plantillas'
    };
    document.getElementById('titulo-vista').textContent = titulos[this.ui.vista] || '';
  },

  /* ============ Panel ============ */
  vPanel() {
    const zid = this.ui.zonaId;
    const contactos = Store.contactosDeZona(zid);
    const servidores = contactos.filter(c => Store.esServidor(c));
    const caminantes = contactos.filter(c => !Store.esServidor(c));
    const proximos = Store.retirosProximos(zid);
    const prox = proximos[0];

    let cardProx = '<div class="tarjeta"><h3>Próximo retiro</h3><div class="vacio">No hay retiros programados. Crea uno en la sección Retiros.</div></div>';
    if (prox) {
      const dias = Math.ceil((new Date(prox.fechaInicio) - new Date()) / 86400000);
      const insTodos = Store.inscripcionesDe(prox.id);
      const inscritos = { length: insTodos.length };
      const nServ = insTodos.filter(i => i.papel === 'servidor').length;
      const nCam = insTodos.length - nServ;
      cardProx = `
        <div class="tarjeta">
          <h3>Próximo retiro · ${esc(Store.zona(prox.zonaId)?.nombre || '')}</h3>
          <p style="margin:4px 0"><strong>${esc(prox.nombre)}</strong> — ${fmtRango(prox.fechaInicio, prox.fechaFin)}</p>
          <p style="margin:4px 0">📍 ${esc(prox.lugar)} · faltan <strong>${dias} días</strong> · ${nServ} servidores y ${nCam} caminantes inscritos</p>
          <button class="btn ambar" onclick="App.abrirRetiro('${prox.id}')">Preparar convocatoria →</button>
        </div>`;
    }

    const hoy = new Date().toISOString().slice(0, 10);
    const proxAct = Store.db.actividades
      .filter(a => (zid === 'all' || a.zonaId === zid) && a.fecha >= hoy)
      .sort((a, b) => a.fecha.localeCompare(b.fecha))[0];
    let cardAct = '';
    if (proxAct) {
      const aviso = this.avisoActividad(proxAct);
      cardAct = `
        <div class="tarjeta">
          <h3>Próxima actividad · ${esc(Store.zona(proxAct.zonaId)?.nombre || '')}</h3>
          <p style="margin:4px 0"><strong>${esc(proxAct.titulo)}</strong> — ${fmtFechaConDia(proxAct.fecha)}${proxAct.hora ? ` · ${esc(proxAct.hora)} h` : ''} · 📍 ${esc(proxAct.lugar || '')}</p>
          <p style="margin:4px 0"><span class="badge ${aviso.clase}">${aviso.texto}</span></p>
          <button class="btn" onclick="App.abrirActividad('${proxAct.id}')">Preparar convocatoria →</button>
        </div>`;
    }

    const anio = new Date().getFullYear();
    const zonasMostrar = Store.db.zonas.filter(z => zid === 'all' || z.id === zid);
    const equipos = zonasMostrar.map(z => {
      const e = Store.equipoDe(z.id, anio);
      if (!e) return `<p><strong>${esc(z.nombre)}:</strong> <span class="vacio">sin equipo asignado para ${anio}</span></p>`;
      const linea = (m, rol) => {
        if (!m || !m.contactoId) return '';
        const c = Store.contacto(m.contactoId);
        if (!c) return '';
        const esLider = rol === 'Líder';
        return `<span class="badge ${esLider ? 'rol-lider' : 'rol-colider'}"><span class="avatar-rol ${esLider ? 'lider' : 'colider'}" style="width:16px;height:16px;font-size:.62rem;margin-right:4px;box-shadow:none;background:#fff;color:${esLider ? '#a86a14' : 'var(--azul)'}">${esLider ? 'L' : 'C'}</span>${rol}: ${esc(c.nombre)} ${esc(c.apellidos)}</span> `;
      };
      return `<p><strong>${esc(z.nombre)}</strong>${e.alias ? ` · equipo «${esc(e.alias)}»` : ''}: ${linea(e.lider, 'Líder')}${(e.colideres || []).map(co => linea(co, 'Colíder')).join('')}</p>`;
    }).join('');

    const retFuturos = proximos.map(r => r.id);
    const pendientes = Store.db.acciones
      .filter(a => !a.hecha && retFuturos.includes(a.retiroId))
      .sort((a, b) => (a.fechaLimite || '9999').localeCompare(b.fechaLimite || '9999'))
      .slice(0, 6);
    const filasAcc = pendientes.map(a => {
      const c = a.contactoId ? Store.contacto(a.contactoId) : null;
      const r = Store.retiro(a.retiroId);
      return `<tr>
        <td>${esc(a.titulo)}</td>
        <td>${c ? esc(c.nombre + ' ' + c.apellidos) : '<span class="vacio">sin asignar</span>'}</td>
        <td>${fmtCorto(a.fechaLimite)}</td>
        <td>${esc(r ? r.nombre : '')}</td>
      </tr>`;
    }).join('');

    return `
      <div class="fila-tarjetas">
        <div class="stat"><div class="num">${servidores.length}</div><div class="etq">Servidores</div></div>
        <div class="stat"><div class="num">${caminantes.length}</div><div class="etq">Caminantes</div></div>
        <div class="stat"><div class="num">${proximos.length}</div><div class="etq">Retiros programados</div></div>
        <div class="stat"><div class="num">${pendientes.length}</div><div class="etq">Acciones pendientes</div></div>
      </div>
      ${cardProx}
      ${cardAct}
      <div class="tarjeta"><h3>Equipo ${anio}</h3>${equipos || '<div class="vacio">Sin zonas creadas.</div>'}</div>
      <div class="tarjeta"><h3>Acciones pendientes</h3>
        ${pendientes.length ? `<table><thead><tr><th>Acción</th><th>Responsable</th><th>Fecha límite</th><th>Retiro</th></tr></thead><tbody>${filasAcc}</tbody></table>` : '<div class="vacio">Todo al día ✔</div>'}
      </div>`;
  },

  /* ============ Contactos ============ */
  // Definición de columnas: cómo se ordena y cómo se pinta cada una
  colsContactos() {
    return [
      {
        id: 'nombre', titulo: 'Nombre',
        sort: c => `${c.apellidos || ''} ${c.nombre || ''}`.toLowerCase(),
        render: c => {
          const rol = Store.rolDe(c.id);
          const esLider = rol && rol.rol === 'Líder';
          return `${rol ? `<span class="avatar-rol ${esLider ? 'lider' : 'colider'}" title="${rol.rol}">${esLider ? 'L' : 'C'}</span>` : ''}<strong>${esc(c.nombre)} ${esc(c.apellidos)}</strong>`;
        }
      },
      {
        id: 'etiquetas', titulo: 'Etiquetas',
        sort: c => Store.tipo(c) + (Store.rolDe(c.id) ? ' 0' : ' 1'),
        render: c => {
          const rol = Store.rolDe(c.id);
          const tipo = Store.tipo(c);
          const sirveEn = tipo === 'servidor' ? Store.sirveEn(c.id) : null;
          const nServicios = tipo === 'servidor' ? Store.vecesServido(c.id) : 0;
          const veterano = tipo === 'servidor' && (nServicios > 0 || Store.haServidoAntes(c.id));
          const esLider = rol && rol.rol === 'Líder';
          return `<span class="badge ${tipo}">${tipo === 'servidor' ? 'Servidor' : 'Caminante'}</span>
            ${sirveEn ? `<span class="badge sirve">Sirve · ${fmtCorto(sirveEn.fechaInicio)}</span>` : ''}
            ${veterano ? `<span class="badge veterano">${nServicios > 0 ? `Ha servido ×${nServicios}` : 'Ha servido antes'}</span>` : ''}
            ${rol ? `<span class="badge ${esLider ? 'rol-lider' : 'rol-colider'}">${rol.rol}${rol.alias ? ' · ' + esc(rol.alias) : ''}</span>` : ''}`;
        }
      },
      { id: 'zona', titulo: 'Zona', sort: c => Store.zona(c.zonaId)?.nombre || '', render: c => esc(Store.zona(c.zonaId)?.nombre || '—') },
      { id: 'telefono', titulo: 'Teléfono', sort: c => c.telefono || '', render: c => esc(c.telefono || '—') },
      { id: 'email', titulo: 'Email', sort: c => c.email || '', render: c => esc(c.email || '—') },
      { id: 'retiro', titulo: 'Retiro vivido', sort: c => c.fechaRetiro || '', render: c => fmtCorto(c.fechaRetiro) },
      { id: 'servicios', titulo: 'Veces servido', sort: c => Store.vecesServido(c.id), render: c => { const n = Store.vecesServido(c.id); return n ? `×${n}` : '—'; } },
      { id: 'dni', titulo: 'DNI', sort: c => c.dni || '', render: c => esc(c.dni || '—') },
      { id: 'nacimiento', titulo: 'Nacimiento', sort: c => c.fechaNacimiento || '', render: c => fmtCorto(c.fechaNacimiento) },
      { id: 'localidad', titulo: 'Localidad', sort: c => c.localidad || '', render: c => esc(c.localidad || '—') }
    ];
  },

  cargarPrefsContactos() {
    if (this.prefsContactos) return this.prefsContactos;
    let p = null;
    try { p = JSON.parse(localStorage.getItem('emausApp.prefsContactos') || 'null'); } catch (e) { }
    this.prefsContactos = p || {
      orden: ['nombre', 'etiquetas', 'zona', 'telefono', 'email', 'retiro', 'servicios', 'dni', 'nacimiento', 'localidad'],
      visibles: ['nombre', 'etiquetas', 'zona', 'telefono', 'email', 'retiro'],
      sortCol: 'nombre', sortDir: 1
    };
    return this.prefsContactos;
  },

  guardarPrefsContactos() {
    localStorage.setItem('emausApp.prefsContactos', JSON.stringify(this.prefsContactos));
  },

  colSort(id) {
    const p = this.cargarPrefsContactos();
    if (p.sortCol === id) p.sortDir *= -1;
    else { p.sortCol = id; p.sortDir = 1; }
    this.guardarPrefsContactos();
    this.render();
  },

  colVisible(id, visible) {
    const p = this.cargarPrefsContactos();
    if (visible && !p.visibles.includes(id)) p.visibles.push(id);
    if (!visible) {
      if (p.visibles.length <= 1) { alert('Debe quedar visible al menos una columna.'); this.render(); return; }
      p.visibles = p.visibles.filter(x => x !== id);
    }
    this.guardarPrefsContactos();
    this.render();
  },

  toggleColPanel() { this.ui.colPanel = !this.ui.colPanel; this.render(); },

  /* --- Selección múltiple de contactos --- */
  selUno(id, marcado) {
    const s = this.sel || (this.sel = new Set());
    if (marcado) s.add(id); else s.delete(id);
    this.render();
  },

  selTodos(marcado) {
    const s = this.sel || (this.sel = new Set());
    (this._idsFiltrados || []).forEach(id => marcado ? s.add(id) : s.delete(id));
    this.render();
  },

  eliminarSeleccionados() {
    const ids = [...(this.sel || [])].filter(id => Store.contacto(id));
    if (!ids.length) return;
    if (!confirm(`¿Eliminar ${ids.length} contacto${ids.length > 1 ? 's' : ''}? Se quitarán también sus inscripciones.`)) return;
    ids.forEach(id => Store.borrarContacto(id));
    this.sel.clear();
    this.render();
  },

  colDragStart(ev, id) {
    ev.dataTransfer.setData('text/plain', id);
    ev.dataTransfer.effectAllowed = 'move';
  },

  colDrop(ev, destino) {
    ev.preventDefault();
    const id = ev.dataTransfer.getData('text/plain');
    if (!id || id === destino) return;
    const p = this.cargarPrefsContactos();
    const orden = p.orden.filter(x => x !== id);
    orden.splice(orden.indexOf(destino), 0, id);
    p.orden = orden;
    this.guardarPrefsContactos();
    this.render();
  },

  vContactos() {
    const p = this.cargarPrefsContactos();
    const cols = this.colsContactos();
    const porId = Object.fromEntries(cols.map(c => [c.id, c]));
    // El orden guardado se completa con las columnas nuevas que vayan apareciendo
    p.orden = p.orden.filter(id => porId[id]).concat(cols.map(c => c.id).filter(id => !p.orden.includes(id)));
    const visibles = p.orden.filter(id => p.visibles.includes(id)).map(id => porId[id]);
    const colOrden = porId[p.sortCol] || porId.nombre;

    const txt = this.ui.buscar.toLowerCase();
    const lista = Store.contactosDeZona(this.ui.zonaId)
      .filter(c => !txt || `${c.nombre} ${c.apellidos} ${c.dni} ${c.email}`.toLowerCase().includes(txt))
      .sort((a, b) => {
        const va = colOrden.sort(a), vb = colOrden.sort(b);
        const cmp = typeof va === 'number' ? va - vb : String(va).localeCompare(String(vb), 'es');
        return cmp * p.sortDir;
      });

    this._idsFiltrados = lista.map(c => c.id);
    const sel = this.sel || (this.sel = new Set());
    const nSel = [...sel].filter(id => Store.contacto(id)).length;
    const todosSel = lista.length > 0 && lista.every(c => sel.has(c.id));

    const cabeceras = `
      <th style="width:34px"><input type="checkbox" ${todosSel ? 'checked' : ''} title="Seleccionar todos"
        onclick="event.stopPropagation()" onchange="App.selTodos(this.checked)"></th>` + visibles.map(col => `
      <th draggable="true" title="Clic: ordenar · Arrastrar: mover columna"
          ondragstart="App.colDragStart(event, '${col.id}')"
          ondragover="event.preventDefault()"
          ondrop="App.colDrop(event, '${col.id}')"
          onclick="App.colSort('${col.id}')"
          style="cursor:pointer;user-select:none;white-space:nowrap">
        ${col.titulo}${p.sortCol === col.id ? (p.sortDir === 1 ? ' ▲' : ' ▼') : ''}
      </th>`).join('');

    const filas = lista.map(c =>
      `<tr onclick="App.abrirContacto('${c.id}')" style="cursor:pointer">
        <td onclick="event.stopPropagation()"><input type="checkbox" ${sel.has(c.id) ? 'checked' : ''} onchange="App.selUno('${c.id}', this.checked)"></td>
        ${visibles.map(col => `<td>${col.render(c)}</td>`).join('')}</tr>`
    ).join('');

    const panelColumnas = this.ui.colPanel ? `
      <div style="background:#f8f9fb;border:1px solid var(--borde);border-radius:8px;padding:10px 14px;margin-bottom:12px">
        <strong style="font-size:.85rem">Columnas visibles</strong>
        <span class="nota"> — arrastra una cabecera de la tabla para cambiar el orden de las columnas.</span>
        <div style="display:flex;flex-wrap:wrap;gap:2px 22px;margin-top:6px">
          ${p.orden.map(id => `
            <label class="check-linea" style="margin:3px 0"><input type="checkbox" ${p.visibles.includes(id) ? 'checked' : ''}
              onchange="App.colVisible('${id}', this.checked)"> ${porId[id].titulo}</label>`).join('')}
        </div>
      </div>` : '';

    return `
      <div class="tarjeta">
        <div class="acciones-linea" style="justify-content:space-between">
          <input placeholder="Buscar por nombre, DNI o email…" style="flex:1;max-width:340px"
                 value="${esc(this.ui.buscar)}" oninput="App.setBuscar(this.value)">
          <div class="acciones-linea" style="margin:0">
            ${nSel ? `<button class="btn peligro" onclick="App.eliminarSeleccionados()">🗑 Eliminar (${nSel})</button>` : ''}
            <button class="btn secundario" onclick="App.toggleColPanel()">⚙ Columnas</button>
            <button class="btn secundario" onclick="App.exportarContactosCSV()">⬇ Exportar CSV</button>
            <label class="btn secundario" style="margin:0;cursor:pointer">⬆ Importar CSV
              <input type="file" accept=".csv,text/csv" style="display:none" onchange="App.importarContactosCSV(this)"></label>
            <button class="btn" onclick="App.abrirContacto(null)">+ Nuevo contacto</button>
          </div>
        </div>
        ${panelColumnas}
        ${lista.length ? `<div class="tabla-scroll"><table><thead><tr>${cabeceras}</tr></thead><tbody>${filas}</tbody></table></div>` : '<div class="vacio">No hay contactos.</div>'}
        <p class="nota" style="margin-top:10px">Clic en una cabecera para ordenar (segundo clic invierte el orden) y arrástrala para mover la columna. La etiqueta cambia sola: con fecha de retiro vivido es <strong>Servidor</strong>; sin ella, <strong>Caminante</strong>.</p>
      </div>`;
  },

  // Columnas del CSV: mismas que el modelo de contacto, con la zona por nombre para que sea legible/editable en Excel
  colsCSVContactos() {
    return ['nombre', 'apellidos', 'dni', 'fechaNacimiento', 'email', 'telefono', 'zona', 'fechaRetiro', 'serviciosPrevios', 'direccion', 'cp', 'localidad', 'fechaExpedicionDni'];
  },

  exportarContactosCSV() {
    const cab = this.colsCSVContactos();
    const lista = Store.contactosDeZona(this.ui.zonaId).sort((a, b) => (a.apellidos || '').localeCompare(b.apellidos || '', 'es'));
    const filas = lista.map(c => cab.map(k => k === 'zona' ? (Store.zona(c.zonaId)?.nombre || '') : (c[k] ?? '')));
    descargarCSV(`contactos-emaus-${hoyISO()}.csv`, cab, filas);
  },

  importarContactosCSV(input) {
    const file = input.files && input.files[0];
    if (!file) return;
    const lector = new FileReader();
    lector.onload = () => {
      let filas;
      try { filas = csvParse(lector.result); } catch (e) { alert('No se pudo leer el archivo CSV.'); return; }
      if (!filas.length) { alert('El CSV no tiene filas de datos.'); input.value = ''; return; }
      let creados = 0, actualizados = 0;
      const avisosZona = new Set();
      const zonaPorDefecto = this.ui.zonaId !== 'all' ? this.ui.zonaId : (Store.db.zonas[0]?.id || '');
      for (const f of filas) {
        if (!f.nombre && !f.apellidos) continue;
        let zonaId = zonaPorDefecto;
        if (f.zona) {
          const z = Store.db.zonas.find(x => x.nombre.toLowerCase() === f.zona.trim().toLowerCase());
          if (z) zonaId = z.id;
          else { avisosZona.add(f.zona.trim()); }
        }
        const dni = (f.dni || '').toUpperCase();
        const email = (f.email || '').toLowerCase();
        const existente = Store.db.contactos.find(x =>
          (dni && (x.dni || '').toUpperCase() === dni) || (email && (x.email || '').toLowerCase() === email));
        const datos = {
          nombre: f.nombre || (existente ? existente.nombre : ''),
          apellidos: f.apellidos || (existente ? existente.apellidos : ''),
          dni, fechaNacimiento: f.fechaNacimiento || '', email, telefono: f.telefono || '',
          zonaId, fechaRetiro: f.fechaRetiro || null,
          serviciosPrevios: f.serviciosPrevios ? Math.max(0, parseInt(f.serviciosPrevios, 10) || 0) : 0,
          direccion: f.direccion || '', cp: f.cp || '', localidad: f.localidad || '',
          fechaExpedicionDni: f.fechaExpedicionDni || ''
        };
        if (existente) { Store.guardarContacto({ id: existente.id, ...datos }); actualizados++; }
        else { Store.guardarContacto(datos); creados++; }
      }
      let msg = `Importación completada: ${creados} contactos nuevos, ${actualizados} actualizados.`;
      if (avisosZona.size) msg += `\n\nZonas no encontradas (se asignaron a la zona por defecto): ${[...avisosZona].join(', ')}.`;
      alert(msg);
      input.value = '';
      this.render();
    };
    lector.onerror = () => alert('No se pudo leer el archivo.');
    lector.readAsText(file, 'utf-8');
  },

  abrirContacto(id) {
    const c = id ? Store.contacto(id) : { zonaId: this.ui.zonaId !== 'all' ? this.ui.zonaId : (Store.db.zonas[0]?.id || '') };
    const zonas = Store.db.zonas.map(z =>
      `<option value="${z.id}" ${c.zonaId === z.id ? 'selected' : ''}>${esc(z.nombre)}</option>`).join('');
    const d = document.getElementById('contactoDialog');
    d.innerHTML = `
      <h3 style="margin-top:0">${id ? 'Ficha de contacto' : 'Nuevo contacto'}</h3>
      <div class="grid2">
        <div class="campo"><label>Nombre</label><input id="f-nombre" value="${esc(c.nombre)}" style="width:100%"></div>
        <div class="campo"><label>Apellidos</label><input id="f-apellidos" value="${esc(c.apellidos)}" style="width:100%"></div>
        <div class="campo"><label>DNI</label><input id="f-dni" value="${esc(c.dni)}" style="width:100%"></div>
        <div class="campo"><label>Fecha de nacimiento</label><input id="f-nacimiento" type="date" value="${esc(c.fechaNacimiento)}" style="width:100%"></div>
        <div class="campo"><label>Email</label><input id="f-email" type="email" value="${esc(c.email)}" style="width:100%"></div>
        <div class="campo"><label>Teléfono</label><input id="f-telefono" value="${esc(c.telefono)}" style="width:100%"></div>
        <div class="campo"><label>Zona</label><select id="f-zona" style="width:100%" onchange="App.zonaSelectCambio(this)">${zonas}<option value="__nueva__">➕ Crear nueva zona…</option></select></div>
        <div class="campo"><label>Fecha en que vivió su retiro<br><small>(vacío = todavía caminante)</small></label>
          <input id="f-retiro" type="date" value="${esc(c.fechaRetiro)}" style="width:100%"></div>
        <div class="campo"><label>Veces que sirvió antes de la app<br><small>(se suman a los retiros registrados aquí)</small></label>
          <input id="f-servicios-previos" type="number" min="0" value="${c.serviciosPrevios || 0}" style="width:100%"></div>
      </div>
      ${(() => {
        if (!id) return '';
        const partes = [];
        const servicios = Store.serviciosDe(id);
        const previos = (Store.contacto(id)?.serviciosPrevios) || 0;
        const totalServicios = servicios.length + previos;
        if (totalServicios) {
          const detalle = [
            servicios.map(x => `${esc(x.nombre)} (${fmtCorto(x.fechaInicio)})`).join(' — '),
            previos ? `${previos} ${previos === 1 ? 'servicio' : 'servicios'} antes de la app` : ''
          ].filter(Boolean).join(' — ');
          partes.push(`<p class="nota"><strong>Ha servido ${totalServicios} ${totalServicios === 1 ? 'vez' : 'veces'}:</strong> ${detalle}</p>`);
        }
        const acciones = Store.accionesDeContacto(id).slice(0, 5);
        if (acciones.length) {
          partes.push(`<p class="nota"><strong>Acciones en retiros:</strong> ${acciones.map(x =>
            `${x.hecha ? '✔' : '⏳'} ${esc(x.titulo)} · ${esc(x.retiro.nombre)} (${fmtCorto(x.retiro.fechaInicio)})`).join(' — ')}</p>`);
        }
        const acts = Store.actividadesDe(id).slice(0, 5);
        if (acts.length) {
          partes.push(`<p class="nota"><strong>Últimas actividades:</strong> ${acts.map(x =>
            `${esc(x.titulo)} (${fmtCorto(x.fecha)})`).join(' — ')}</p>`);
        }
        const hist = Store.historialRoles(id);
        if (hist.length) {
          partes.push(`<p class="nota"><strong>Servicio en equipos:</strong> ${hist.map(h =>
            `${h.anio} ${h.rol} · ${esc(Store.zona(h.zonaId)?.nombre || '')} («${esc(h.alias || '')}»)`).join(' — ')}</p>`);
        }
        return partes.join('');
      })()}
      <div class="dialog-pie">
        <div>${id ? `<button class="btn peligro" onclick="App.borrarContacto('${id}')">Eliminar</button>` : ''}</div>
        <div style="display:flex;gap:8px">
          <button class="btn secundario" onclick="document.getElementById('contactoDialog').close()">Cancelar</button>
          <button class="btn" onclick="App.guardarContacto('${id || ''}')">Guardar</button>
        </div>
      </div>`;
    d.showModal();
  },

  guardarContacto(id) {
    const v = x => document.getElementById(x).value.trim();
    if (!v('f-nombre')) { alert('El nombre es obligatorio.'); return; }
    Store.guardarContacto({
      id: id || undefined,
      nombre: v('f-nombre'), apellidos: v('f-apellidos'),
      dni: v('f-dni'), fechaNacimiento: v('f-nacimiento'),
      email: v('f-email'), telefono: v('f-telefono'),
      zonaId: v('f-zona'), fechaRetiro: v('f-retiro') || null,
      serviciosPrevios: Math.max(0, parseInt(v('f-servicios-previos'), 10) || 0)
    });
    document.getElementById('contactoDialog').close();
    this.render();
  },

  borrarContacto(id) {
    if (!confirm('¿Eliminar este contacto? Se quitarán también sus inscripciones.')) return;
    Store.borrarContacto(id);
    document.getElementById('contactoDialog').close();
    this.render();
  },

  /* ============ Equipo ============ */
  setEquipoAnio(v) {
    if (v === '__otro__') {
      const a = parseInt(prompt('¿De qué año quieres meter el equipo? (ej. 2019)') || '', 10);
      if (!a || a < 1980 || a > 2100) { this.render(); return; }
      this.ui.equipoAnio = a;
    } else {
      this.ui.equipoAnio = parseInt(v, 10);
    }
    this.render();
  },

  vEquipo() {
    const anioActual = new Date().getFullYear();
    const anio = this.ui.equipoAnio || anioActual;
    const zonas = Store.db.zonas.filter(z => this.ui.zonaId === 'all' || z.id === this.ui.zonaId);
    if (!zonas.length) return '<div class="tarjeta vacio">Crea primero una zona en Ajustes.</div>';

    const anios = [...new Set(Store.db.equipos.map(e => e.anio).concat([anio, anioActual, anioActual + 1]))]
      .sort((a, b) => b - a);
    const selector = `
      <div class="tarjeta">
        <div class="acciones-linea" style="align-items:center">
          <label style="margin:0">Año del equipo:</label>
          <select onchange="App.setEquipoAnio(this.value)">
            ${anios.map(a => `<option value="${a}" ${a === anio ? 'selected' : ''}>${a}</option>`).join('')}
            <option value="__otro__">Otro año…</option>
          </select>
          <span class="nota">Elige un año pasado para registrar el histórico de líderes y colíderes.</span>
        </div>
      </div>`;

    return selector + zonas.map(z => {
      const e = Store.equipoDe(z.id, anio) || { alias: '', lider: { contactoId: null }, colideres: [{ contactoId: null }, { contactoId: null }] };
      const servidores = Store.servidoresDeZona(z.id);
      const opcion = (c, sel, extra) =>
        `<option value="${c.id}" ${sel === c.id ? 'selected' : ''}>${esc(c.nombre)} ${esc(c.apellidos)}${extra || ''}</option>`;
      const opcionesCo = sel => `<option value="">— sin asignar —</option>` + servidores.map(c => opcion(c, sel)).join('');
      // Para líder se excluye a quien ya fue líder otro año (no se puede repetir de líder)
      const opcionesLider = sel => `<option value="">— sin asignar —</option>` + servidores
        .filter(c => c.id === sel || !Store.haSidoLider(c.id, anio))
        .map(c => opcion(c, sel)).join('');
      const co = i => (e.colideres && e.colideres[i]) || { contactoId: null };

      const otros = Store.db.equipos
        .filter(x => x.zonaId === z.id && x.anio !== anio)
        .sort((a, b) => b.anio - a.anio);
      const nom = id => { const c = id ? Store.contacto(id) : null; return c ? `${c.nombre} ${c.apellidos}` : '—'; };
      const historial = otros.length
        ? `<hr class="sep"><p class="nota"><strong>Equipos de otros años</strong> (quien ya fue líder no aparece en el desplegable de líder):</p>` +
          otros.map(p =>
            `<p class="nota">· ${p.anio} · equipo «${esc(p.alias || '')}» — Líder: <strong>${esc(nom(p.lider?.contactoId))}</strong> · Colíderes: ${(p.colideres || []).filter(x => x.contactoId).map(x => esc(nom(x.contactoId))).join(', ') || '—'}</p>`
          ).join('')
        : '';
      const existeEquipo = !!Store.equipoDe(z.id, anio);

      return `
        <div class="tarjeta">
          <h3>${esc(z.nombre)} · Equipo ${anio}</h3>
          <p class="nota">Solo pueden ser líder o colíder los <strong>servidores</strong>. El servicio dura normalmente un año. El alias es <strong>del equipo</strong>. De <strong>líder no se puede repetir</strong>; de colíder sí.</p>
          <div class="campo"><label>Alias del equipo</label>
            <input id="eq-${z.id}-alias" value="${esc(e.alias)}" placeholder="Ej. Peregrinos" style="width:100%;max-width:320px"></div>
          <div class="grid2" style="grid-template-columns:1fr 1fr 1fr">
            <div class="campo"><label>Líder</label><select id="eq-${z.id}-lider" style="width:100%">${opcionesLider(e.lider?.contactoId)}</select></div>
            <div class="campo"><label>Colíder 1</label><select id="eq-${z.id}-co1" style="width:100%">${opcionesCo(co(0).contactoId)}</select></div>
            <div class="campo"><label>Colíder 2</label><select id="eq-${z.id}-co2" style="width:100%">${opcionesCo(co(1).contactoId)}</select></div>
          </div>
          <div class="acciones-linea">
            <button class="btn" onclick="App.guardarEquipo('${z.id}', ${anio})">Guardar equipo</button>
            ${existeEquipo ? `<button class="btn mini peligro" onclick="App.borrarEquipo('${z.id}', ${anio})">Quitar equipo de ${anio}</button>` : ''}
          </div>
          ${historial}
        </div>`;
    }).join('');
  },

  guardarEquipo(zonaId, anio) {
    const v = x => document.getElementById(x).value;
    const liderId = v(`eq-${zonaId}-lider`) || null;
    if (liderId && Store.haSidoLider(liderId, anio)) {
      const c = Store.contacto(liderId);
      alert(`${c.nombre} ${c.apellidos} ya fue líder otro año y no puede repetir como líder. Sí puede ser colíder.`);
      return;
    }
    Store.guardarEquipo(zonaId, anio, {
      alias: v(`eq-${zonaId}-alias`).trim(),
      lider: { contactoId: liderId },
      colideres: [
        { contactoId: v(`eq-${zonaId}-co1`) || null },
        { contactoId: v(`eq-${zonaId}-co2`) || null }
      ]
    });
    this.render();
  },

  borrarEquipo(zonaId, anio) {
    if (!confirm(`¿Quitar el equipo de ${anio} de esta zona?`)) return;
    Store.borrarEquipo(zonaId, anio);
    this.render();
  },

  /* ============ Retiros ============ */
  vRetiros() {
    const lista = Store.db.retiros
      .filter(r => this.ui.zonaId === 'all' || r.zonaId === this.ui.zonaId)
      .sort((a, b) => b.fechaInicio.localeCompare(a.fechaInicio));

    const tarjetas = lista.map(r => {
      const ins = Store.inscripcionesDe(r.id);
      const pasado = r.fechaFin < new Date().toISOString().slice(0, 10);
      return `
        <div class="tarjeta">
          <div style="display:flex;justify-content:space-between;align-items:start;gap:10px;flex-wrap:wrap">
            <div>
              <h3 style="margin-bottom:4px">${esc(r.nombre)}</h3>
              <p style="margin:2px 0">${esc(Store.zona(r.zonaId)?.nombre || '')} · ${fmtRango(r.fechaInicio, r.fechaFin)}</p>
              <p style="margin:2px 0">📍 ${esc(r.lugar)} · ${ins.length} inscritos
                ${r.cerrado ? '<span class="badge cerrado">Cerrado</span>' : (pasado ? '<span class="badge pendiente">Pendiente de cerrar</span>' : '<span class="badge abierto">Abierto</span>')}</p>
            </div>
            <button class="btn" onclick="App.abrirRetiro('${r.id}')">Abrir →</button>
          </div>
        </div>`;
    }).join('');

    return `
      <div class="acciones-linea"><button class="btn" onclick="App.dialogoRetiro(null)">+ Nuevo retiro</button></div>
      ${tarjetas || '<div class="tarjeta vacio">No hay retiros. Crea el primero.</div>'}`;
  },

  abrirRetiro(id) {
    this.ui.vista = 'retiros';
    this.ui.retiroId = id;
    this.render();
  },

  dialogoRetiro(id) {
    const r = id ? Store.retiro(id) : { zonaId: this.ui.zonaId !== 'all' ? this.ui.zonaId : (Store.db.zonas[0]?.id || '') };
    const zonas = Store.db.zonas.map(z =>
      `<option value="${z.id}" ${r.zonaId === z.id ? 'selected' : ''}>${esc(z.nombre)}</option>`).join('');
    const d = document.getElementById('contactoDialog');
    d.innerHTML = `
      <h3 style="margin-top:0">${id ? 'Editar retiro' : 'Nuevo retiro'}</h3>
      <div class="campo"><label>Nombre del retiro</label><input id="r-nombre" value="${esc(r.nombre)}" placeholder="Retiro de Emaús · Hombres" style="width:100%"></div>
      <div class="grid2">
        <div class="campo"><label>Zona</label><select id="r-zona" style="width:100%" onchange="App.zonaSelectCambio(this)">${zonas}<option value="__nueva__">➕ Crear nueva zona…</option></select></div>
        <div class="campo"><label>Lugar</label><input id="r-lugar" value="${esc(r.lugar)}" style="width:100%"></div>
        <div class="campo"><label>Fecha inicio</label><input id="r-inicio" type="date" value="${esc(r.fechaInicio)}" style="width:100%"></div>
        <div class="campo"><label>Fecha fin</label><input id="r-fin" type="date" value="${esc(r.fechaFin)}" style="width:100%"></div>
        <div class="campo"><label>Precio (€)</label><input id="r-precio" type="number" min="0" value="${esc(r.precio)}" style="width:100%"></div>
        <div class="campo"><label>Suplemento hab. individual (€)</label><input id="r-supl" type="number" min="0" value="${esc(r.suplementoIndividual)}" style="width:100%"></div>
      </div>
      <div class="campo"><label>Información para el formulario (pago, equipación, horarios, contactos…)</label>
        <textarea id="r-info" rows="5">${esc(r.infoExtra)}</textarea></div>
      <div class="dialog-pie">
        <div></div>
        <div style="display:flex;gap:8px">
          <button class="btn secundario" onclick="document.getElementById('contactoDialog').close()">Cancelar</button>
          <button class="btn" onclick="App.guardarRetiro('${id || ''}')">Guardar</button>
        </div>
      </div>`;
    d.showModal();
  },

  guardarRetiro(id) {
    const v = x => document.getElementById(x).value.trim();
    if (!v('r-nombre') || !v('r-inicio')) { alert('Nombre y fecha de inicio son obligatorios.'); return; }
    const rid = Store.guardarRetiro({
      id: id || undefined, nombre: v('r-nombre'), zonaId: v('r-zona'),
      lugar: v('r-lugar'), fechaInicio: v('r-inicio'), fechaFin: v('r-fin') || v('r-inicio'),
      precio: v('r-precio') ? Number(v('r-precio')) : null,
      suplementoIndividual: v('r-supl') ? Number(v('r-supl')) : null,
      infoExtra: document.getElementById('r-info').value.trim()
    });
    document.getElementById('contactoDialog').close();
    this.abrirRetiro(rid);
  },

  vRetiroDetalle() {
    const r = Store.retiro(this.ui.retiroId);
    if (!r) { this.ui.retiroId = null; return this.vRetiros(); }
    const zona = Store.zona(r.zonaId);
    const hoy = new Date().toISOString().slice(0, 10);
    const pasado = r.fechaFin < hoy;

    /* --- Convocatoria --- */
    const pl = Store.db.plantillas;
    const wa = rellenarPlantilla(pl.whatsapp, r, null);
    const emailAsunto = rellenarPlantilla(pl.emailAsunto, r, null);
    const emailCuerpo = rellenarPlantilla(pl.emailCuerpo, r, null);
    const destinatarios = Store.servidoresDeZona(r.zonaId).filter(c => c.email).map(c => c.email).join('; ');

    /* --- Inscripciones --- */
    const inscripciones = Store.inscripcionesDe(r.id);
    const nServRetiro = inscripciones.filter(i => i.papel === 'servidor').length;
    const nCamRetiro = inscripciones.length - nServRetiro;
    const filtro = this.ui.insFiltro || 'todos';
    const insMostradas = inscripciones.filter(i => filtro === 'todos' || i.papel === filtro);
    const filasIns = insMostradas.map(i => {
      const c = Store.contacto(i.contactoId);
      if (!c) return '';
      // Se compara con la fecha de inicio del retiro: ¿había servido ya antes de este retiro?
      const nAntes = i.papel === 'servidor'
        ? Store.serviciosDe(c.id).filter(x => x.fechaFin < r.fechaInicio).length + (c.serviciosPrevios || 0)
        : 0;
      const veterano = i.papel === 'servidor' ? (nAntes > 0 || Store.haServidoAntes(c.id, r.fechaInicio)) : false;
      return `<tr>
        <td><strong>${esc(c.nombre)} ${esc(c.apellidos)}</strong></td>
        <td><span class="badge ${i.papel}">${i.papel === 'servidor' ? 'Sirve' : 'Caminante'}</span>
            ${i.papel === 'servidor' ? (veterano ? `<span class="badge veterano">Ya ha servido${nAntes > 0 ? ' ×' + nAntes : ''}</span>` : '<span class="badge caminante">1ª vez sirviendo</span>') : ''}</td>
        <td>${esc(c.telefono || '—')}</td>
        <td>
          <select onchange="App.estadoInscripcion('${i.id}', this.value)">
            <option value="pendiente" ${i.estado === 'pendiente' ? 'selected' : ''}>Pendiente</option>
            <option value="confirmada" ${i.estado === 'confirmada' ? 'selected' : ''}>Confirmada</option>
          </select>
        </td>
        <td style="white-space:nowrap">
          <label class="check-linea" style="margin:0 0 4px"><input type="checkbox" ${i.pagado ? 'checked' : ''} onchange="App.insCampo('${i.id}', 'pagado', this.checked, true)"> Pagado</label>
          <select onchange="App.insCampo('${i.id}', 'metodoPago', this.value)">
            <option value="">— método —</option>
            ${['Transferencia', 'Bizum', 'Efectivo', 'Otro'].map(m => `<option ${i.metodoPago === m ? 'selected' : ''}>${m}</option>`).join('')}
          </select>
        </td>
        <td><input value="${esc(i.notas)}" placeholder="Notas…" onchange="App.insCampo('${i.id}', 'notas', this.value)" style="width:140px"></td>
        <td>
          ${i.detalles ? `<button class="btn mini secundario" onclick="App.verFichaInscripcion('${i.id}')">Ficha</button>` : ''}
          <button class="btn mini peligro" onclick="App.quitarInscripcion('${i.id}')">Quitar</button>
        </td>
      </tr>`;
    }).join('');
    const pagados = inscripciones.filter(i => i.pagado).length;

    const yaInscritos = inscripciones.map(i => i.contactoId);
    const candidatos = Store.contactosDeZona(r.zonaId).filter(c => !yaInscritos.includes(c.id));
    const opcionesIns = candidatos.map(c =>
      `<option value="${c.id}">${esc(c.nombre)} ${esc(c.apellidos)} (${Store.tipo(c)})</option>`).join('');

    /* --- Acciones --- */
    const acciones = Store.accionesDe(r.id).sort((a, b) => (a.fechaLimite || '9999').localeCompare(b.fechaLimite || '9999'));
    // Acciones asignables a: servidores registrados en ESTE retiro + líder y colíderes de la zona
    const posiblesResponsables = Store.responsablesDeRetiro(r.id);
    const filasAcc = acciones.map(a => {
      // Si la acción quedó asignada a alguien que ya no está inscrito, se mantiene visible
      const lista = posiblesResponsables.some(c => c.id === a.contactoId) || !a.contactoId
        ? posiblesResponsables
        : posiblesResponsables.concat(Store.contacto(a.contactoId) || []);
      const opts = `<option value="">— sin asignar —</option>` + lista.map(c =>
        `<option value="${c.id}" ${a.contactoId === c.id ? 'selected' : ''}>${esc(c.nombre)} ${esc(c.apellidos)}</option>`).join('');
      return `<tr style="${a.hecha ? 'opacity:.55' : ''}">
        <td><input type="checkbox" ${a.hecha ? 'checked' : ''} onchange="App.marcarAccion('${a.id}', this.checked)"></td>
        <td>${esc(a.titulo)}</td>
        <td><select onchange="App.asignarAccion('${a.id}', this.value)">${opts}</select></td>
        <td>${fmtCorto(a.fechaLimite)}</td>
      </tr>`;
    }).join('');

    /* --- Documentos necesarios --- */
    const documentos = Store.documentosDe(r.id);
    const filasDoc = documentos.map(d => `<tr style="${d.listo ? 'opacity:.6' : ''}">
        <td><input type="checkbox" ${d.listo ? 'checked' : ''} onchange="App.marcarDocumento('${d.id}', this.checked)"></td>
        <td><strong>${esc(d.titulo)}</strong>${d.notas ? `<br><span class="nota">${esc(d.notas)}</span>` : ''}</td>
        <td>${d.enlace ? `<a class="enlace" href="${esc(d.enlace)}" target="_blank" rel="noopener">Ver enlace</a>` : '—'}</td>
        <td><button class="btn mini peligro" onclick="App.borrarDocumento('${d.id}')">Quitar</button></td>
      </tr>`).join('');
    const docsListos = documentos.filter(d => d.listo).length;

    /* --- Cartas a los caminantes --- */
    const caminantesRetiro = inscripciones.filter(i => i.papel === 'caminante').map(i => Store.contacto(i.contactoId)).filter(Boolean);
    const diaEnMedio = fmtFecha(Store.diaEnMedio(r));
    const filasCartas = caminantesRetiro.map(c => {
      const cartas = Store.cartasDeCaminante(r.id, c.id);
      const impresas = cartas.filter(x => x.impresa).length;
      return `<tr>
        <td><strong>${esc(c.nombre)} ${esc(c.apellidos)}</strong></td>
        <td>${cartas.length ? `<span class="badge sirve">✉️ ${cartas.length}</span> <span class="badge ${impresas === cartas.length ? 'confirmada' : 'pendiente'}">${impresas}/${cartas.length} impresas</span>` : '<span class="vacio">sin cartas</span>'}</td>
        <td><button class="btn mini secundario" onclick="App.dialogoCartas('${r.id}', '${c.id}')">Ver / añadir cartas</button></td>
      </tr>`;
    }).join('');

    return `
      <div class="acciones-linea">
        <button class="btn secundario mini" onclick="App.ir('retiros')">← Volver a retiros</button>
        <button class="btn mini" onclick="App.dialogoRetiro('${r.id}')">Editar datos</button>
        ${pasado && !r.cerrado ? `<button class="btn ambar mini" onclick="App.cerrarRetiro('${r.id}')">Cerrar retiro: convertir caminantes en servidores</button>` : ''}
        ${r.cerrado ? '<span class="badge cerrado">Retiro cerrado · caminantes convertidos en servidores</span>' : ''}
      </div>

      <div class="tarjeta">
        <h3>${esc(r.nombre)}</h3>
        <p style="margin:4px 0">${esc(zona?.nombre || '')} · ${fmtRango(r.fechaInicio, r.fechaFin)} · 📍 ${esc(r.lugar)}</p>
      </div>

      ${r.acta ? (() => {
        const filasPart = r.acta.participantes.map(p => `<tr>
          <td><strong>${esc(p.nombre)}</strong></td>
          <td><span class="badge ${p.papel}">${p.papel === 'servidor' ? 'Sirvió' : 'Caminante'}</span></td>
          <td>${p.estado === 'confirmada' ? 'Confirmada' : 'Pendiente'}</td>
          <td>${p.pagado ? '✔ Pagado' + (p.metodoPago ? ' · ' + esc(p.metodoPago) : '') : '—'}</td>
          <td>${esc(p.notas || '')}</td>
        </tr>`).join('');
        const filasActa = r.acta.acciones.map(a => `<tr>
          <td>${a.hecha ? '✔' : '⏳'}</td>
          <td>${esc(a.titulo)}</td>
          <td>${esc(a.responsable) || '<span class="vacio">sin asignar</span>'}</td>
        </tr>`).join('');
        return `
      <div class="tarjeta" style="border-left:5px solid var(--verde)">
        <h3>📜 Acta del retiro · registro permanente</h3>
        <p class="nota">Grabada al cerrar el retiro (${fmtCorto(r.acta.cerradoEl)}). Este registro no cambia aunque después se editen o eliminen contactos.</p>
        <p style="margin:10px 0 4px"><strong>Participantes (${r.acta.participantes.length})</strong></p>
        <div class="tabla-scroll"><table><thead><tr><th>Nombre</th><th>Papel</th><th>Inscripción</th><th>Pago</th><th>Notas</th></tr></thead><tbody>${filasPart}</tbody></table></div>
        ${r.acta.acciones.length ? `
        <p style="margin:14px 0 4px"><strong>Acciones (${r.acta.acciones.length})</strong></p>
        <div class="tabla-scroll"><table><thead><tr><th></th><th>Acción</th><th>Responsable</th></tr></thead><tbody>${filasActa}</tbody></table></div>` : ''}
      </div>`;
      })() : ''}

      <div class="tarjeta">
        <h3>📣 Convocatoria · WhatsApp (difusión)</h3>
        <p class="nota">Copia este mensaje y pégalo en tu lista de difusión o grupo de WhatsApp de servidores.</p>
        <textarea id="txt-wa" rows="9">${esc(wa)}</textarea>
        <div class="acciones-linea" style="margin-top:8px">
          <button class="btn" onclick="App.copiar('txt-wa', this)">📋 Copiar mensaje</button>
        </div>
      </div>

      <div class="tarjeta">
        <h3>📣 Convocatoria · Email</h3>
        <p class="nota">Copia los destinatarios en <strong>CCO</strong> (copia oculta), el asunto y el cuerpo en tu correo. En la fase de despliegue conectaremos una cuenta Gmail de Emaús para enviarlo automáticamente y personalizado con el nombre de cada servidor.</p>
        <div class="campo"><label>Destinatarios (servidores de ${esc(zona?.nombre || 'la zona')} con email)</label>
          <textarea id="txt-cco" rows="2">${esc(destinatarios)}</textarea></div>
        <div class="campo"><label>Asunto</label>
          <textarea id="txt-asunto" rows="1">${esc(emailAsunto)}</textarea></div>
        <div class="campo"><label>Cuerpo</label>
          <textarea id="txt-cuerpo" rows="12">${esc(emailCuerpo)}</textarea></div>
        <div class="acciones-linea">
          <button class="btn" onclick="App.copiar('txt-cco', this)">📋 Copiar destinatarios</button>
          <button class="btn" onclick="App.copiar('txt-asunto', this)">📋 Copiar asunto</button>
          <button class="btn" onclick="App.copiar('txt-cuerpo', this)">📋 Copiar cuerpo</button>
        </div>
      </div>

      <div class="tarjeta">
        <h3>Inscripciones (${inscripciones.length})${inscripciones.length ? ` · <span style="color:${pagados === inscripciones.length ? 'var(--verde)' : 'var(--ambar)'}">${pagados}/${inscripciones.length} pagados</span>` : ''}</h3>
        ${inscripciones.length ? `
        <div class="acciones-linea">
          <button class="btn mini ${filtro === 'todos' ? '' : 'secundario'}" onclick="App.setInsFiltro('todos')">Todos (${inscripciones.length})</button>
          <button class="btn mini ${filtro === 'servidor' ? '' : 'secundario'}" onclick="App.setInsFiltro('servidor')">Sirven en este retiro (${nServRetiro})</button>
          <button class="btn mini ${filtro === 'caminante' ? '' : 'secundario'}" onclick="App.setInsFiltro('caminante')">Caminantes (${nCamRetiro})</button>
        </div>` : ''}
        ${inscripciones.length ? `<table><thead><tr><th>Nombre</th><th>Papel</th><th>Teléfono</th><th>Estado</th><th>Pago</th><th>Notas</th><th></th></tr></thead><tbody>${filasIns}</tbody></table>` : '<div class="vacio">Nadie inscrito todavía. Las inscripciones del formulario público aparecerán aquí.</div>'}
        ${candidatos.length ? `
        <hr class="sep">
        <div class="acciones-linea">
          <select id="ins-contacto">${opcionesIns}</select>
          <select id="ins-papel"><option value="servidor">Viene a servir</option><option value="caminante">Caminante</option></select>
          <button class="btn mini" onclick="App.inscribirManual('${r.id}')">+ Añadir inscrito</button>
        </div>` : ''}
      </div>

      <div class="tarjeta">
        <div class="acciones-linea" style="justify-content:space-between">
          <h3 style="margin:0">Acciones del retiro</h3>
          <div class="acciones-linea" style="margin:0">
            ${acciones.length ? `<button class="btn secundario mini" onclick="App.exportarAccionesCSV('${r.id}')">⬇ Exportar CSV</button>` : ''}
            <label class="btn secundario mini" style="margin:0;cursor:pointer">⬆ Importar CSV
              <input type="file" accept=".csv,text/csv" style="display:none" onchange="App.importarAccionesCSV(this, '${r.id}')"></label>
          </div>
        </div>
        <p class="nota">Las acciones se asignan a los <strong>servidores registrados en este retiro</strong> y al <strong>equipo de la zona</strong> (líder y colíderes) — ${posiblesResponsables.length} disponibles.</p>
        ${acciones.length ? `<table><thead><tr><th></th><th>Acción</th><th>Responsable</th><th>Fecha límite</th></tr></thead><tbody>${filasAcc}</tbody></table>` : '<div class="vacio">Sin acciones todavía.</div>'}
        <hr class="sep">
        <div class="acciones-linea">
          <input id="acc-titulo" placeholder="Nueva acción… (ej. Reservar la casa)" style="flex:1;min-width:220px">
          <input id="acc-fecha" type="date">
          <button class="btn mini" onclick="App.nuevaAccion('${r.id}')">+ Añadir acción</button>
        </div>
        <p class="nota" style="margin-top:8px">CSV de acciones: columnas <code>titulo</code>, <code>responsable</code> (nombre completo, opcional), <code>fechaLimite</code> (AAAA-MM-DD, opcional), <code>hecha</code> (Sí/No, opcional).</p>
      </div>

      <div class="tarjeta">
        <h3>Documentos necesarios${documentos.length ? ` · <span style="color:${docsListos === documentos.length ? 'var(--verde)' : 'var(--ambar)'}">${docsListos}/${documentos.length} listos</span>` : ''}</h3>
        ${documentos.length ? `<table><thead><tr><th></th><th>Documento</th><th>Enlace</th><th></th></tr></thead><tbody>${filasDoc}</tbody></table>` : '<div class="vacio">Sin documentos todavía.</div>'}
        <hr class="sep">
        <div class="acciones-linea">
          <input id="doc-titulo" placeholder="Nuevo documento… (ej. Autorización de imagen)" style="flex:1;min-width:220px">
          <input id="doc-enlace" placeholder="Enlace (opcional)" style="flex:1;min-width:160px">
          <button class="btn mini" onclick="App.nuevoDocumento('${r.id}')">+ Añadir documento</button>
        </div>
      </div>

      <div class="tarjeta">
        <h3>✉️ Cartas a los caminantes</h3>
        <p class="nota">Las cartas se reciben desde antes del retiro y durante la preparación, hasta el día de en medio (<strong>${diaEnMedio}</strong>). Recuerda pedir que en el asunto del email conste a qué caminante va cada carta.</p>
        ${caminantesRetiro.length ? `<table><thead><tr><th>Caminante</th><th>Cartas</th><th></th></tr></thead><tbody>${filasCartas}</tbody></table>` : '<div class="vacio">Todavía no hay caminantes inscritos en este retiro.</div>'}
      </div>`;
  },

  /* ---------- Documentos ---------- */
  nuevoDocumento(retiroId) {
    const titulo = document.getElementById('doc-titulo').value.trim();
    if (!titulo) return;
    Store.guardarDocumento({ retiroId, titulo, enlace: document.getElementById('doc-enlace').value.trim(), listo: false, notas: '' });
    this.render();
  },

  marcarDocumento(id, listo) {
    Store.guardarDocumento({ id, listo });
    this.render();
  },

  borrarDocumento(id) {
    Store.borrarDocumento(id);
    this.render();
  },

  /* ---------- Cartas a los caminantes ---------- */
  dialogoCartas(retiroId, contactoId) {
    const c = Store.contacto(contactoId);
    const cartas = Store.cartasDeCaminante(retiroId, contactoId);
    const filas = cartas.map(carta => `
      <tr>
        <td><strong>Nº ${carta.numero}</strong></td>
        <td>${esc(carta.remitente || '—')}</td>
        <td>${fmtCorto(carta.fecha)}</td>
        <td><input type="checkbox" ${carta.impresa ? 'checked' : ''} onchange="App.marcarCartaImpresa('${carta.id}', this.checked)"> Impresa</td>
        <td><button class="btn mini peligro" onclick="App.borrarCartaDialogo('${carta.id}', '${retiroId}', '${contactoId}')">Quitar</button></td>
      </tr>`).join('');
    const siguiente = Store.siguienteNumeroCarta(retiroId, contactoId);
    const d = document.getElementById('contactoDialog');
    d.innerHTML = `
      <h3 style="margin-top:0">Cartas para ${esc(c.nombre)} ${esc(c.apellidos)}</h3>
      ${cartas.length ? `<table><thead><tr><th>Nº</th><th>Remitente</th><th>Fecha</th><th>Impresa</th><th></th></tr></thead><tbody>${filas}</tbody></table>` : '<p class="vacio">Todavía no ha recibido ninguna carta.</p>'}
      <hr class="sep">
      <p style="margin:0 0 8px"><strong>Añadir carta nº ${siguiente}</strong></p>
      <div class="grid2">
        <div class="campo"><label>Remitente (opcional)</label><input id="carta-remitente" style="width:100%"></div>
        <div class="campo"><label>Fecha</label><input id="carta-fecha" type="date" value="${hoyISO()}" style="width:100%"></div>
      </div>
      <label class="check-linea"><input type="checkbox" id="carta-impresa"> Ya está impresa</label>
      <div class="dialog-pie">
        <div></div>
        <div style="display:flex;gap:8px">
          <button class="btn secundario" onclick="document.getElementById('contactoDialog').close(); App.render()">Cerrar</button>
          <button class="btn" onclick="App.nuevaCarta('${retiroId}', '${contactoId}')">+ Añadir carta</button>
        </div>
      </div>`;
    d.showModal();
  },

  nuevaCarta(retiroId, contactoId) {
    Store.guardarCarta({
      retiroId, contactoId,
      numero: Store.siguienteNumeroCarta(retiroId, contactoId),
      remitente: document.getElementById('carta-remitente').value.trim(),
      fecha: document.getElementById('carta-fecha').value || hoyISO(),
      impresa: document.getElementById('carta-impresa').checked,
      notas: ''
    });
    this.dialogoCartas(retiroId, contactoId);
  },

  marcarCartaImpresa(id, impresa) {
    Store.guardarCarta({ id, impresa });
  },

  borrarCartaDialogo(id, retiroId, contactoId) {
    Store.borrarCarta(id);
    this.dialogoCartas(retiroId, contactoId);
  },

  copiar(idElemento, boton) {
    const texto = document.getElementById(idElemento).value;
    navigator.clipboard.writeText(texto).then(() => {
      const original = boton.textContent;
      boton.textContent = '✔ Copiado';
      setTimeout(() => { boton.textContent = original; }, 1600);
    });
  },

  setInsFiltro(f) { this.ui.insFiltro = f; this.render(); },

  // Guarda un campo de la inscripción; con render=true refresca (p. ej. el contador de pagados)
  insCampo(id, campo, valor, render) {
    Store.actualizarInscripcion(id, { [campo]: valor });
    if (render) this.render();
  },

  verFichaInscripcion(id) {
    const i = Store.db.inscripciones.find(x => x.id === id);
    if (!i || !i.detalles) return;
    const c = Store.contacto(i.contactoId);
    const det = i.detalles;
    const etiquetas = {
      fechaInscripcion: 'Fecha de inscripción', caminoOrigen: 'Vivió su retiro en',
      primeraVez: '¿Primera vez sirviendo?', dondeSirvio: 'Ha servido antes en',
      ronca: '¿Ronca?',
      habitacionIndividual: 'Habitación individual', dormirConRoncador: '¿Puede dormir con roncador?',
      companeroHabitacion: 'Compañero de habitación', emergenciaNombre: 'Emergencia · nombre',
      emergenciaTelefono: 'Emergencia · teléfono', emergenciaRelacion: 'Emergencia · relación',
      privacidadAceptada: 'Privacidad aceptada'
    };
    const filaEquipacion = (det.pedidoEquipacion && det.pedidoEquipacion.length)
      ? `<tr><td style="color:var(--texto-suave)">Equipación pedida</td><td><strong>${det.pedidoEquipacion.map(x =>
          `${esc(x.producto)} (${esc(x.talla)}) — ${x.estado === 'stock' ? '✔ reservada' : '🛒 pedido pendiente'}`).join('<br>')}</strong></td></tr>`
      : '';
    const filas = filaEquipacion + Object.entries(etiquetas)
      .filter(([k]) => det[k] !== undefined && det[k] !== '' && det[k] !== null && !(Array.isArray(det[k]) && !det[k].length))
      .map(([k, etq]) => {
        let val = det[k];
        if (Array.isArray(val)) val = val.join(', ');
        if (val === true) val = 'Sí';
        return `<tr><td style="color:var(--texto-suave)">${etq}</td><td><strong>${esc(String(val))}</strong></td></tr>`;
      }).join('');
    const extraContacto = [
      c?.direccion ? `<tr><td style="color:var(--texto-suave)">Dirección</td><td><strong>${esc(c.direccion)}${c.cp ? ', ' + esc(c.cp) : ''}${c.localidad ? ' ' + esc(c.localidad) : ''}</strong></td></tr>` : '',
      c?.fechaExpedicionDni ? `<tr><td style="color:var(--texto-suave)">DNI expedido el</td><td><strong>${fmtCorto(c.fechaExpedicionDni)}</strong></td></tr>` : ''
    ].join('');
    const pagoFilas = `
      <tr><td style="color:var(--texto-suave)">Pago</td><td><strong>${i.pagado ? '✔ Pagado' + (i.metodoPago ? ' · ' + esc(i.metodoPago) : '') : 'Pendiente de pago'}</strong></td></tr>
      ${i.notas ? `<tr><td style="color:var(--texto-suave)">Notas</td><td><strong>${esc(i.notas)}</strong></td></tr>` : ''}`;
    const d = document.getElementById('contactoDialog');
    d.innerHTML = `
      <h3 style="margin-top:0">Ficha de inscripción · ${esc(c ? c.nombre + ' ' + c.apellidos : '')}</h3>
      <table>${pagoFilas}${extraContacto}${filas}</table>
      <div class="dialog-pie"><div></div>
        <button class="btn secundario" onclick="document.getElementById('contactoDialog').close()">Cerrar</button>
      </div>`;
    d.showModal();
  },

  estadoInscripcion(id, estado) {
    Store.actualizarInscripcion(id, { estado });
    this.render();
  },

  quitarInscripcion(id) {
    Store.borrarInscripcion(id);
    this.render();
  },

  inscribirManual(retiroId) {
    const cid = document.getElementById('ins-contacto').value;
    const papel = document.getElementById('ins-papel').value;
    if (!cid) return;
    const c = Store.contacto(cid);
    if (papel === 'servidor' && !Store.esServidor(c)) {
      alert(`${c.nombre} todavía es caminante: no puede venir a servir. Inscríbelo como caminante o registra la fecha de su retiro en su ficha.`);
      return;
    }
    Store.inscribir(retiroId, cid, papel);
    this.render();
  },

  marcarAccion(id, hecha) {
    Store.guardarAccion({ id, hecha });
    this.render();
  },

  asignarAccion(id, contactoId) {
    Store.guardarAccion({ id, contactoId: contactoId || null });
    this.render();
  },

  nuevaAccion(retiroId) {
    const titulo = document.getElementById('acc-titulo').value.trim();
    if (!titulo) return;
    Store.guardarAccion({
      retiroId, titulo,
      contactoId: null,
      fechaLimite: document.getElementById('acc-fecha').value || null,
      hecha: false
    });
    this.render();
  },

  exportarAccionesCSV(retiroId) {
    const r = Store.retiro(retiroId);
    const cab = ['titulo', 'responsable', 'fechaLimite', 'hecha'];
    const filas = Store.accionesDe(retiroId).map(a => {
      const c = a.contactoId ? Store.contacto(a.contactoId) : null;
      return [a.titulo, c ? `${c.nombre} ${c.apellidos}` : '', a.fechaLimite || '', a.hecha ? 'Sí' : 'No'];
    });
    descargarCSV(`acciones-${(r?.nombre || 'retiro').replace(/[^\w]+/g, '-')}.csv`, cab, filas);
  },

  importarAccionesCSV(input, retiroId) {
    const file = input.files && input.files[0];
    if (!file) return;
    const lector = new FileReader();
    lector.onload = () => {
      let filas;
      try { filas = csvParse(lector.result); } catch (e) { alert('No se pudo leer el archivo CSV.'); return; }
      if (!filas.length) { alert('El CSV no tiene filas de datos.'); input.value = ''; return; }
      const responsables = Store.responsablesDeRetiro(retiroId);
      let creadas = 0;
      const sinResponsable = new Set();
      for (const f of filas) {
        if (!f.titulo) continue;
        let contactoId = null;
        if (f.responsable) {
          const match = responsables.find(c => `${c.nombre} ${c.apellidos}`.toLowerCase().trim() === f.responsable.toLowerCase().trim());
          if (match) contactoId = match.id;
          else sinResponsable.add(f.responsable.trim());
        }
        Store.guardarAccion({
          retiroId, titulo: f.titulo, contactoId,
          fechaLimite: f.fechaLimite || null,
          hecha: /^(s|si|sí|true|1|x)$/i.test((f.hecha || '').trim())
        });
        creadas++;
      }
      let msg = `Importación completada: ${creadas} acciones añadidas.`;
      if (sinResponsable.size) msg += `\n\nNo son servidores de este retiro ni del equipo de la zona, se dejaron sin asignar: ${[...sinResponsable].join(', ')}.`;
      alert(msg);
      input.value = '';
      this.render();
    };
    lector.onerror = () => alert('No se pudo leer el archivo.');
    lector.readAsText(file, 'utf-8');
  },

  cerrarRetiro(id) {
    if (!confirm('¿Cerrar el retiro? Los caminantes inscritos pasarán a ser servidores con la fecha de este retiro.')) return;
    const n = Store.cerrarRetiro(id);
    alert(`Retiro cerrado. ${n} caminante(s) han pasado a ser servidores. 🎉`);
    this.render();
  },

  /* ============ Actividades del año ============ */
  // Aviso de convocatoria: hay que enviarla N días antes de la actividad
  avisoActividad(act) {
    const hoy = new Date().toISOString().slice(0, 10);
    if (act.fecha < hoy) return { texto: 'Celebrada', clase: 'cerrado' };
    const d = new Date(act.fecha + 'T12:00:00');
    d.setDate(d.getDate() - (act.diasAntes === undefined ? 2 : act.diasAntes));
    const fechaEnvio = d.toISOString().slice(0, 10);
    if (hoy >= fechaEnvio) return { texto: '📣 ¡Toca enviar la convocatoria!', clase: 'caminante' };
    return { texto: `Enviar convocatoria el ${fmtCorto(fechaEnvio)}`, clase: 'pendiente' };
  },

  abrirActividad(id) {
    this.ui.vista = 'actividades';
    this.ui.actividadId = id;
    this.render();
  },

  vActividades() {
    const hoy = new Date().toISOString().slice(0, 10);
    const lista = Store.db.actividades
      .filter(a => this.ui.zonaId === 'all' || a.zonaId === this.ui.zonaId)
      .sort((a, b) => {
        const pa = a.fecha < hoy, pb = b.fecha < hoy;
        if (pa !== pb) return pa ? 1 : -1;            // primero las futuras
        return pa ? b.fecha.localeCompare(a.fecha)    // pasadas: la más reciente primero
                  : a.fecha.localeCompare(b.fecha);   // futuras: la más próxima primero
      });

    const tarjetas = lista.map(a => {
      const aviso = this.avisoActividad(a);
      return `
        <div class="tarjeta">
          <div style="display:flex;justify-content:space-between;align-items:start;gap:10px;flex-wrap:wrap">
            <div>
              <h3 style="margin-bottom:4px">${esc(a.titulo)}</h3>
              <p style="margin:2px 0">${esc(Store.zona(a.zonaId)?.nombre || '')} · ${fmtFechaConDia(a.fecha)}${a.hora ? ` · ${esc(a.hora)} h` : ''}</p>
              <p style="margin:2px 0">📍 ${esc(a.lugar || '')} <span class="badge ${aviso.clase}">${aviso.texto}</span></p>
            </div>
            <button class="btn" onclick="App.abrirActividad('${a.id}')">Abrir →</button>
          </div>
        </div>`;
    }).join('');

    return `
      <p class="nota">Reuniones, adoraciones, charlas… todo lo que pasa entre retiro y retiro. Cada actividad genera su email de convocatoria para los servidores de la zona, que hay que enviar unos días antes.</p>
      <div class="acciones-linea"><button class="btn" onclick="App.dialogoActividad(null)">+ Nueva actividad</button></div>
      ${tarjetas || '<div class="tarjeta vacio">No hay actividades. Crea la primera.</div>'}`;
  },

  vActividadDetalle() {
    const a = Store.actividad(this.ui.actividadId);
    if (!a) { this.ui.actividadId = null; return this.vActividades(); }
    const zona = Store.zona(a.zonaId);
    const aviso = this.avisoActividad(a);
    const asunto = rellenarPlantillaActividad(Store.db.plantillas.emailActividadAsunto, a);
    const cuerpo = rellenarPlantillaActividad(Store.db.plantillas.emailActividadCuerpo, a);
    const destinatarios = Store.servidoresDeZona(a.zonaId).filter(c => c.email).map(c => c.email).join('; ');

    return `
      <div class="acciones-linea">
        <button class="btn secundario mini" onclick="App.ir('actividades')">← Volver a actividades</button>
        <button class="btn mini" onclick="App.dialogoActividad('${a.id}')">Editar</button>
        <button class="btn mini peligro" onclick="App.borrarActividad('${a.id}')">Eliminar</button>
        <span class="badge ${aviso.clase}">${aviso.texto}</span>
      </div>

      <div class="tarjeta">
        <h3>${esc(a.titulo)}</h3>
        <p style="margin:4px 0">${esc(zona?.nombre || '')} · ${fmtFechaConDia(a.fecha)}${a.hora ? ` · ${esc(a.hora)} h` : ''} · 📍 ${esc(a.lugar || '')}</p>
        ${a.programa ? `<p style="margin:8px 0 2px"><strong>Programa:</strong></p><div class="plantilla-caja">${esc(a.programa)}</div>` : ''}
        ${a.avisos ? `<p style="margin:8px 0 2px"><strong>Avisos:</strong></p><div class="plantilla-caja">${esc(a.avisos)}</div>` : ''}
      </div>

      <div class="tarjeta">
        <h3>📣 Convocatoria por email · servidores de ${esc(zona?.nombre || 'la zona')}</h3>
        <p class="nota">Copia los destinatarios en <strong>CCO</strong>, el asunto y el cuerpo. Cuando la app esté en la nube, este correo se enviará solo ${a.diasAntes === undefined ? 2 : a.diasAntes} días antes desde la cuenta Gmail de Emaús.</p>
        <div class="campo"><label>Destinatarios (${destinatarios ? destinatarios.split(';').length : 0} servidores con email)</label>
          <textarea id="act-cco" rows="2">${esc(destinatarios)}</textarea></div>
        <div class="campo"><label>Asunto</label>
          <textarea id="act-asunto" rows="2">${esc(asunto)}</textarea></div>
        <div class="campo"><label>Cuerpo</label>
          <textarea id="act-cuerpo" rows="16">${esc(cuerpo)}</textarea></div>
        <div class="acciones-linea">
          <button class="btn" onclick="App.copiar('act-cco', this)">📋 Copiar destinatarios</button>
          <button class="btn" onclick="App.copiar('act-asunto', this)">📋 Copiar asunto</button>
          <button class="btn" onclick="App.copiar('act-cuerpo', this)">📋 Copiar cuerpo</button>
        </div>
      </div>

      ${(() => {
        const servidoresZona = Store.servidoresDeZona(a.zonaId);
        if (!servidoresZona.length) return '';
        const asistentes = a.asistentes || [];
        const filas = servidoresZona.map(c => `
          <label class="check-linea"><input type="checkbox" ${asistentes.includes(c.id) ? 'checked' : ''}
            onchange="App.marcarAsistencia('${a.id}', '${c.id}', this.checked)"> ${esc(c.nombre)} ${esc(c.apellidos)}</label>`).join('');
        return `
          <div class="tarjeta">
            <h3>Asistencia (${asistentes.length}/${servidoresZona.length} servidores)</h3>
            <p class="nota">Marca quién asistió: queda registrado en la ficha de cada servidor como sus últimas actividades.</p>
            ${filas}
          </div>`;
      })()}`;
  },

  marcarAsistencia(actividadId, contactoId, asiste) {
    Store.marcarAsistencia(actividadId, contactoId, asiste);
    this.render();
  },

  dialogoActividad(id) {
    const a = id ? Store.actividad(id) : { zonaId: this.ui.zonaId !== 'all' ? this.ui.zonaId : (Store.db.zonas[0]?.id || ''), diasAntes: 2 };
    const zonas = Store.db.zonas.map(z =>
      `<option value="${z.id}" ${a.zonaId === z.id ? 'selected' : ''}>${esc(z.nombre)}</option>`).join('');
    const d = document.getElementById('contactoDialog');
    d.innerHTML = `
      <h3 style="margin-top:0">${id ? 'Editar actividad' : 'Nueva actividad'}</h3>
      <div class="campo"><label>Título</label><input id="a-titulo" value="${esc(a.titulo)}" placeholder="Reunión de los jueves" style="width:100%"></div>
      <div class="grid2">
        <div class="campo"><label>Zona</label><select id="a-zona" style="width:100%" onchange="App.zonaSelectCambio(this)">${zonas}<option value="__nueva__">➕ Crear nueva zona…</option></select></div>
        <div class="campo"><label>Lugar</label><input id="a-lugar" value="${esc(a.lugar)}" style="width:100%"></div>
        <div class="campo"><label>Fecha</label><input id="a-fecha" type="date" value="${esc(a.fecha)}" style="width:100%"></div>
        <div class="campo"><label>Hora</label><input id="a-hora" type="time" value="${esc(a.hora)}" style="width:100%"></div>
        <div class="campo"><label>Enlace de ubicación (Google Maps)</label><input id="a-ubicacion" value="${esc(a.enlaceUbicacion)}" style="width:100%"></div>
        <div class="campo"><label>Enviar convocatoria (días antes)</label><input id="a-dias" type="number" min="0" max="30" value="${a.diasAntes === undefined ? 2 : a.diasAntes}" style="width:100%"></div>
      </div>
      <div class="campo"><label>Programa (una línea por punto: hora y qué se hace)</label>
        <textarea id="a-programa" rows="5">${esc(a.programa)}</textarea></div>
      <div class="campo"><label>Avisos y recordatorios</label>
        <textarea id="a-avisos" rows="4">${esc(a.avisos)}</textarea></div>
      <div class="dialog-pie">
        <div></div>
        <div style="display:flex;gap:8px">
          <button class="btn secundario" onclick="document.getElementById('contactoDialog').close()">Cancelar</button>
          <button class="btn" onclick="App.guardarActividad('${id || ''}')">Guardar</button>
        </div>
      </div>`;
    d.showModal();
  },

  guardarActividad(id) {
    const v = x => document.getElementById(x).value.trim();
    if (!v('a-titulo') || !v('a-fecha')) { alert('Título y fecha son obligatorios.'); return; }
    const aid = Store.guardarActividad({
      id: id || undefined,
      titulo: v('a-titulo'), zonaId: v('a-zona'), lugar: v('a-lugar'),
      fecha: v('a-fecha'), hora: v('a-hora'), enlaceUbicacion: v('a-ubicacion'),
      diasAntes: v('a-dias') === '' ? 2 : Math.max(0, parseInt(v('a-dias'), 10) || 0),
      programa: document.getElementById('a-programa').value.trim(),
      avisos: document.getElementById('a-avisos').value.trim()
    });
    document.getElementById('contactoDialog').close();
    this.abrirActividad(aid);
  },

  borrarActividad(id) {
    if (!confirm('¿Eliminar esta actividad?')) return;
    Store.borrarActividad(id);
    this.ir('actividades');
  },

  /* ============ Material: stock de ropa y pedidos pendientes ============ */
  /* Vista exclusiva del rol 'tesorería' (y visible también para 'coordinador' vía Tesorería
     si se decide más adelante): ledger de ingresos/gastos por categoría + pagos de inscripciones. */
  vTesoreria() {
    const tes = Store.db.tesoreria;
    const ingresos = tes.movimientos.filter(m => m.tipo === 'ingreso');
    const gastos = tes.movimientos.filter(m => m.tipo === 'gasto');
    const totalIngresos = ingresos.reduce((s, m) => s + m.importe, 0);
    const totalGastos = gastos.reduce((s, m) => s + m.importe, 0);
    const saldo = totalIngresos - totalGastos;

    const nombreCategoria = id => tes.categorias.find(c => c.id === id)?.nombre || '—';
    const nombreRetiro = id => id ? (Store.retiro(id)?.nombre || '—') : '—';

    // Desglose por categoría (para ver de un vistazo cuánto ha entrado/salido de cada partida)
    const desglose = (tipo) => {
      const filtradas = tes.categorias.filter(c => c.tipo === tipo);
      const filas = filtradas.map(c => {
        const total = tes.movimientos.filter(m => m.categoriaId === c.id).reduce((s, m) => s + m.importe, 0);
        return total > 0 ? `<tr><td>${esc(c.nombre)}</td><td style="text-align:right">${total.toFixed(2)} €</td></tr>` : '';
      }).join('');
      return filas || `<tr><td colspan="2" class="nota">Sin movimientos todavía.</td></tr>`;
    };

    const opcionesCategoria = (tipo) => tes.categorias.filter(c => c.tipo === tipo)
      .map(c => `<option value="${c.id}">${esc(c.nombre)}</option>`).join('');
    const opcionesRetiro = `<option value="">— sin retiro concreto —</option>` +
      [...Store.db.retiros].sort((a, b) => b.fechaInicio.localeCompare(a.fechaInicio))
        .map(r => `<option value="${r.id}">${esc(r.nombre)} (${r.fechaInicio})</option>`).join('');

    const filasMovimientos = [...tes.movimientos].sort((a, b) => b.fecha.localeCompare(a.fecha)).map(m => `
      <tr>
        <td>${m.fecha}</td>
        <td><span class="badge ${m.tipo === 'ingreso' ? 'abierto' : 'peligro'}">${m.tipo === 'ingreso' ? 'Ingreso' : 'Gasto'}</span></td>
        <td>${esc(nombreCategoria(m.categoriaId))}</td>
        <td>${esc(nombreRetiro(m.retiroId))}</td>
        <td>${esc(m.concepto || '—')}</td>
        <td style="text-align:right;white-space:nowrap">${m.tipo === 'ingreso' ? '+' : '−'}${m.importe.toFixed(2)} €</td>
        <td><button class="btn mini peligro" onclick="App.quitarMovimiento('${m.id}')">Quitar</button></td>
      </tr>`).join('');

    // Pagos de inscripciones por retiro (lo que ya teníamos)
    const retiros = [...Store.db.retiros].sort((a, b) => b.fechaInicio.localeCompare(a.fechaInicio));
    const bloquesRetiros = retiros.map(r => {
      const inscripciones = Store.db.inscripciones.filter(i => i.retiroId === r.id);
      if (!inscripciones.length) return '';
      const pagados = inscripciones.filter(i => i.pagado).length;
      const filas = inscripciones.map(i => {
        const c = Store.contacto(i.contactoId);
        if (!c) return '';
        return `<tr>
          <td><strong>${esc(c.nombre)} ${esc(c.apellidos)}</strong></td>
          <td><span class="badge ${i.papel}">${i.papel === 'servidor' ? 'Sirve' : 'Caminante'}</span></td>
          <td style="white-space:nowrap">
            <label class="check-linea" style="margin:0 0 4px"><input type="checkbox" ${i.pagado ? 'checked' : ''} onchange="App.insCampo('${i.id}', 'pagado', this.checked, true)"> Pagado</label>
            <select onchange="App.insCampo('${i.id}', 'metodoPago', this.value)">
              <option value="">— método —</option>
              ${['Transferencia', 'Bizum', 'Efectivo', 'Otro'].map(met => `<option ${i.metodoPago === met ? 'selected' : ''}>${met}</option>`).join('')}
            </select>
          </td>
          <td><input value="${esc(i.notas)}" placeholder="Notas…" onchange="App.insCampo('${i.id}', 'notas', this.value)" style="width:160px"></td>
        </tr>`;
      }).join('');
      return `<details style="margin-bottom:10px">
        <summary style="cursor:pointer;font-weight:600">${esc(r.nombre)} — ${pagados}/${inscripciones.length} pagados</summary>
        <table class="tabla" style="margin-top:10px"><thead><tr><th>Nombre</th><th>Papel</th><th>Pago</th><th>Notas</th></tr></thead>
        <tbody>${filas}</tbody></table>
      </details>`;
    }).join('');

    return `
      <h2>💶 Tesorería</h2>

      <div class="tarjeta" style="text-align:center;padding:24px">
        <div class="nota" style="margin-bottom:4px">Saldo actual</div>
        <div style="font-size:2rem;font-weight:700;color:${saldo >= 0 ? 'var(--verde)' : 'var(--rojo, #b3261e)'}">${saldo.toFixed(2)} €</div>
        <div class="nota">Ingresos: ${totalIngresos.toFixed(2)} € · Gastos: ${totalGastos.toFixed(2)} €</div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
        <div class="tarjeta">
          <h3>Ingresos por partida</h3>
          <table><tbody>${desglose('ingreso')}</tbody></table>
        </div>
        <div class="tarjeta">
          <h3>Gastos por partida</h3>
          <table><tbody>${desglose('gasto')}</tbody></table>
        </div>
      </div>

      <div class="tarjeta">
        <h3>Añadir movimiento</h3>
        <div class="acciones-linea">
          <select id="tes-tipo" onchange="App.cambiarTesTipo(this.value)">
            <option value="ingreso" ${(App.ui.tesTipo || 'ingreso') === 'ingreso' ? 'selected' : ''}>Ingreso</option>
            <option value="gasto" ${App.ui.tesTipo === 'gasto' ? 'selected' : ''}>Gasto</option>
          </select>
          <select id="tes-categoria">${opcionesCategoria(App.ui.tesTipo || 'ingreso')}</select>
          <button class="btn mini secundario" onclick="App.nuevaCategoriaTesoreria()">+ Nueva categoría</button>
        </div>
        <div class="acciones-linea" style="margin-top:8px">
          <select id="tes-retiro">${opcionesRetiro}</select>
          <input id="tes-concepto" placeholder="Concepto (opcional)" style="flex:1;min-width:160px">
          <input id="tes-importe" type="number" min="0.01" step="0.01" placeholder="Importe €" style="width:120px">
          <input id="tes-fecha" type="date" value="${new Date().toISOString().slice(0, 10)}">
          <button class="btn ambar mini" onclick="App.nuevoMovimiento()">+ Añadir</button>
        </div>
      </div>

      <div class="tarjeta">
        <h3>Movimientos (${tes.movimientos.length})</h3>
        ${tes.movimientos.length ? `
          <table class="tabla"><thead><tr><th>Fecha</th><th>Tipo</th><th>Categoría</th><th>Retiro</th><th>Concepto</th><th style="text-align:right">Importe</th><th></th></tr></thead>
          <tbody>${filasMovimientos}</tbody></table>` : '<div class="vacio">Sin movimientos todavía.</div>'}
      </div>

      <div class="tarjeta">
        <h3>Pagos de inscripciones por retiro</h3>
        ${bloquesRetiros || '<p class="nota">Sin inscripciones todavía.</p>'}
      </div>`;
  },

  vInventario() {
    const inv = Store.db.inventario;
    const filasStock = inv.productos.map(p => `
      <tr>
        <td><strong>${esc(p.nombre)}</strong></td>
        ${TALLAS.map(t => `<td><input type="number" min="0" style="width:64px" value="${Store.stockDe(p.id, t)}"
          onchange="App.fijarStock('${p.id}', '${t}', this.value)"></td>`).join('')}
      </tr>`).join('');

    const pedidos = [...inv.pedidos].sort((a, b) => (a.atendido === b.atendido ? b.fecha.localeCompare(a.fecha) : a.atendido ? 1 : -1));
    const filasPedidos = pedidos.map(pd => {
      const prod = Store.producto(pd.productoId);
      const c = pd.contactoId ? Store.contacto(pd.contactoId) : null;
      const r = pd.retiroId ? Store.retiro(pd.retiroId) : null;
      return `<tr style="${pd.atendido ? 'opacity:.5' : ''}">
        <td><input type="checkbox" ${pd.atendido ? 'checked' : ''} onchange="App.marcarPedidoAtendido('${pd.id}', this.checked)"></td>
        <td><strong>${esc(prod ? prod.nombre : '')}</strong> · ${esc(pd.talla)}</td>
        <td>${esc(c ? c.nombre + ' ' + c.apellidos : '—')}</td>
        <td>${esc(r ? r.nombre : '—')}</td>
        <td>${fmtCorto(pd.fecha)}</td>
        <td><button class="btn mini peligro" onclick="App.borrarPedido('${pd.id}')">Quitar</button></td>
      </tr>`;
    }).join('');
    const pendientes = pedidos.filter(p => !p.atendido).length;

    return `
      <div class="tarjeta">
        <h3>Stock inicial</h3>
        <p class="nota">Cantidad disponible de cada prenda y talla. Cuando alguien la pide por el formulario de servidores, se descuenta sola; si no queda, pasa a la lista de pedidos pendientes de aquí abajo.</p>
        <div class="tabla-scroll"><table><thead><tr><th>Prenda</th>${TALLAS.map(t => `<th>${t}</th>`).join('')}</tr></thead><tbody>${filasStock}</tbody></table></div>
      </div>
      <div class="tarjeta">
        <h3>Pedidos pendientes${pendientes ? ` · <span style="color:var(--ambar)">${pendientes} por hacer</span>` : ''}</h3>
        ${pedidos.length ? `<div class="tabla-scroll"><table><thead><tr><th></th><th>Prenda</th><th>Solicitado por</th><th>Retiro</th><th>Fecha</th><th></th></tr></thead><tbody>${filasPedidos}</tbody></table></div>` : '<div class="vacio">No hay pedidos pendientes.</div>'}
      </div>`;
  },

  fijarStock(productoId, talla, valor) {
    Store.fijarStock(productoId, talla, Math.max(0, parseInt(valor, 10) || 0));
  },

  marcarPedidoAtendido(id, atendido) {
    Store.marcarPedidoAtendido(id, atendido);
    this.render();
  },

  borrarPedido(id) {
    Store.borrarPedido(id);
    this.render();
  },

  /* ============ Formulario público: enlace para compartir ============ */
  // El formulario en sí ya no vive aquí dentro (requeriría login): vive en formulario.html,
  // sin sesión, hablando directo con Supabase. Aquí solo se genera y copia el enlace.
  setFormRetiro(id) { this.ui.formRetiroId = id; this.render(); },

  vFormulario() {
    const proximos = Store.retirosProximos('all');
    const r = proximos.find(x => x.id === this.ui.formRetiroId) || proximos[0] || null;
    const opciones = proximos.map(x =>
      `<option value="${x.id}" ${r && r.id === x.id ? 'selected' : ''}>${esc(x.nombre)} · ${esc(Store.zona(x.zonaId)?.nombre || '')} · ${fmtRango(x.fechaInicio, x.fechaFin)}</option>`).join('');

    const selector = `
      <div class="tarjeta" style="max-width:640px;margin:0 auto 14px">
        <p class="nota" style="margin-top:0">El formulario de inscripción es una página aparte, sin login, para que cualquiera pueda rellenarlo desde el enlace de la convocatoria. Elige el retiro para obtener sus enlaces:</p>
        <div class="campo"><label>Retiro</label>
          <select onchange="App.setFormRetiro(this.value)" style="width:100%">${opciones || '<option value="">No hay retiros abiertos</option>'}</select></div>
      </div>`;

    if (!r) return selector + '<div class="tarjeta vacio" style="max-width:640px;margin:0 auto">Crea primero un retiro para generar su enlace.</div>';

    const base = (Store.db.ajustes.enlaceBase || (location.origin + location.pathname.replace('app.html', '') + 'formulario.html'));
    const enlaceServidor = `${base}?retiro=${r.id}&tipo=servidor`;
    const enlaceCaminante = `${base}?retiro=${r.id}&tipo=caminante`;

    return selector + `
      <div class="tarjeta" style="max-width:640px;margin:0 auto">
        <h3>${esc(r.nombre)}</h3>
        <p class="nota" style="margin-top:0">Comparte cada enlace por WhatsApp o email según a quién te dirijas.</p>
        <div class="campo"><label>Enlace para SERVIDORES</label>
          <div class="acciones-linea"><input id="enlace-servidor" readonly value="${esc(enlaceServidor)}" style="flex:1"><button class="btn mini" onclick="App.copiar('enlace-servidor', this)">📋 Copiar</button></div></div>
        <div class="campo"><label>Enlace para CAMINANTES</label>
          <div class="acciones-linea"><input id="enlace-caminante" readonly value="${esc(enlaceCaminante)}" style="flex:1"><button class="btn mini" onclick="App.copiar('enlace-caminante', this)">📋 Copiar</button></div></div>
        <a class="enlace" href="${esc(enlaceServidor)}" target="_blank" rel="noopener">Abrir formulario de servidores →</a>
      </div>`;
  },

  /* ============ Ajustes ============ */
  vAjustes() {
    const zonasFilas = Store.db.zonas.map(z => `
      <tr><td><strong>${esc(z.nombre)}</strong></td><td>${z.tipo}</td>
      <td>${Store.contactosDeZona(z.id).length} contactos</td></tr>`).join('');
    const pl = Store.db.plantillas;
    const NOMBRES_ROL = { coordinador: 'Coordinador/a', material: 'Material', tesoreria: 'Tesorería', actividades: 'Actividades' };
    const lideresFilas = Store.db.lideres.length ? `
      <table><thead><tr><th>Email</th><th>Nombre</th><th>Rol</th><th>Estado</th><th></th></tr></thead><tbody>
        ${Store.db.lideres.map(l => `
          <tr>
            <td>${esc(l.email)}</td>
            <td>${esc(l.nombre)}</td>
            <td>
              <select onchange="App.cambiarRolLider('${l.email}', this.value)">
                ${Object.entries(NOMBRES_ROL).map(([id, nom]) => `<option value="${id}" ${l.rol === id ? 'selected' : ''}>${nom}</option>`).join('')}
              </select>
            </td>
            <td>${l.activo ? '<span class="badge abierto">Activo</span>' : '<span class="badge pendiente">Inactivo</span>'}</td>
            <td class="acciones-linea">
              <button class="btn mini" onclick="App.alternarLider('${l.email}', ${!l.activo})">${l.activo ? 'Desactivar' : 'Reactivar'}</button>
              <button class="btn mini peligro" onclick="App.borrarLider('${l.email}')">Eliminar</button>
            </td>
          </tr>`).join('')}
      </tbody></table>` : '';

    return `
      <div class="tarjeta">
        <h3>Organización</h3>
        <div class="acciones-linea">
          <input id="aj-org" value="${esc(Store.db.organizacion.nombre)}" style="flex:1;max-width:400px">
          <button class="btn mini" onclick="App.guardarOrg()">Guardar</button>
        </div>
        <p class="nota">La aplicación es independiente: otra organización puede usarla con su propio nombre, zonas y datos.</p>
        <hr class="sep">
        <label>Logotipo (sale en la barra lateral y en el formulario público)</label>
        <div class="acciones-linea" style="align-items:center">
          ${Store.db.organizacion.logo
            ? `<img src="${Store.db.organizacion.logo}" alt="Logotipo" style="max-height:50px;max-width:150px;border-radius:6px;background:#fff;border:1px solid var(--borde);padding:3px">`
            : '<span class="nota">Sin logotipo.</span>'}
          <input type="file" id="aj-logo" accept="image/*" onchange="App.subirLogo(this)">
          ${Store.db.organizacion.logo ? `<button class="btn mini peligro" onclick="App.quitarLogo()">Quitar</button>` : ''}
        </div>
      </div>

      <div class="tarjeta">
        <h3>Zonas</h3>
        ${zonasFilas ? `<table><thead><tr><th>Nombre</th><th>Tipo</th><th>Contactos</th></tr></thead><tbody>${zonasFilas}</tbody></table>` : '<div class="vacio">Sin zonas.</div>'}
        <hr class="sep">
        <div class="acciones-linea">
          <input id="aj-zona-nombre" placeholder="Nombre de la zona…">
          <select id="aj-zona-tipo"><option value="provincia">Provincia</option><option value="localidad">Localidad</option></select>
          <button class="btn mini" onclick="App.nuevaZona()">+ Añadir zona</button>
        </div>
      </div>

      <div class="tarjeta">
        <h3>Plantilla de email</h3>
        <div class="campo"><label>Asunto</label><input id="aj-email-asunto" value="${esc(pl.emailAsunto)}" style="width:100%"></div>
        <div class="campo"><label>Cuerpo</label><textarea id="aj-email-cuerpo" rows="12">${esc(pl.emailCuerpo)}</textarea></div>
        <h3>Plantilla de WhatsApp (difusión)</h3>
        <div class="campo"><textarea id="aj-wa" rows="9">${esc(pl.whatsapp)}</textarea></div>
        <h3>Plantilla de email de actividades</h3>
        <div class="campo"><label>Asunto</label><input id="aj-act-asunto" value="${esc(pl.emailActividadAsunto)}" style="width:100%"></div>
        <div class="campo"><label>Cuerpo</label><textarea id="aj-act-cuerpo" rows="12">${esc(pl.emailActividadCuerpo)}</textarea></div>
        <p class="nota">Variables de actividades: <code>{titulo}</code> <code>{zona}</code> <code>{fecha}</code> <code>{hora}</code> <code>{lugar}</code> <code>{ubicacion}</code> <code>{programa}</code> <code>{avisos}</code> <code>{alias}</code>.</p>
        <div class="campo"><label>Enlace base del formulario público (la dirección donde está publicada la app, ej. https://emaus-madrid.vercel.app/formulario.html)</label>
          <input id="aj-enlace" value="${esc(Store.db.ajustes.enlaceBase)}" style="width:100%"></div>
        <p class="nota">Variables disponibles: <code>{retiro}</code> <code>{zona}</code> <code>{fecha}</code> <code>{lugar}</code> <code>{enlace}</code> <code>{alias}</code> (alias del equipo de la zona) <code>{nombre}</code> (solo se personaliza en emails automáticos).</p>
        <button class="btn" onclick="App.guardarPlantillas()">Guardar plantillas</button>
      </div>

      <div class="tarjeta">
        <h3>Líderes autorizados</h3>
        <p class="nota">Solo estos emails pueden pedir el enlace mágico y entrar en la app. El rol decide qué ve cada uno: Coordinador/a ve todo; Material, Tesorería y Actividades solo ven su propia sección. Añade aquí a un nuevo líder antes de pasarle el enlace de acceso; si alguien deja de serlo, desactívalo (no borres su fila si ya tiene datos asociados).</p>
        ${lideresFilas || '<div class="vacio">Sin líderes autorizados.</div>'}
        <hr class="sep">
        <div class="acciones-linea">
          <input id="aj-lider-email" type="email" placeholder="email@ejemplo.com">
          <input id="aj-lider-nombre" placeholder="Nombre (opcional)">
          <select id="aj-lider-rol">
            <option value="coordinador">Coordinador/a</option>
            <option value="material">Material</option>
            <option value="tesoreria">Tesorería</option>
            <option value="actividades">Actividades</option>
          </select>
          <button class="btn mini" onclick="App.nuevoLider()">+ Añadir líder</button>
        </div>
      </div>

      <div class="tarjeta">
        <h3>Sesión</h3>
        <p class="nota">Conectado como <strong>${esc(Store.sesion?.user?.email || '')}</strong>. Los datos se guardan en la base de datos compartida: los cambia cualquier líder con sesión y se ven al instante entre todos.</p>
        <button class="btn peligro" onclick="App.cerrarSesion()">Cerrar sesión</button>
      </div>`;
  },

  // El logotipo se reduce a 240 px como máximo para que quepa en el almacenamiento local
  subirLogo(input) {
    const file = input.files && input.files[0];
    if (!file) return;
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const max = 240;
      const escala = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.width * escala));
      canvas.height = Math.max(1, Math.round(img.height * escala));
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob(blob => {
        Store.guardarOrganizacion({ logoBlob: blob });
        this.render();
      }, 'image/png');
    };
    img.onerror = () => { URL.revokeObjectURL(url); alert('No se pudo leer la imagen.'); };
    img.src = url;
  },

  quitarLogo() {
    Store.guardarOrganizacion({ logo: null });
    this.render();
  },

  guardarOrg() {
    Store.guardarOrganizacion({ nombre: document.getElementById('aj-org').value.trim() || 'Emaús' });
    this.render();
  },

  nuevaZona() {
    const nombre = document.getElementById('aj-zona-nombre').value.trim();
    if (!nombre) return;
    Store.nuevaZona(nombre, document.getElementById('aj-zona-tipo').value);
    this.render();
  },

  nuevoLider() {
    const email = document.getElementById('aj-lider-email').value.trim();
    const nombre = document.getElementById('aj-lider-nombre').value.trim();
    const rol = document.getElementById('aj-lider-rol').value;
    if (!email) return;
    Store.nuevoLider(email, nombre, rol);
    this.render();
  },

  alternarLider(email, activo) {
    Store.alternarLider(email, activo);
    this.render();
  },

  cambiarRolLider(email, rol) {
    Store.cambiarRolLider(email, rol);
    this.render();
  },

  borrarLider(email) {
    if (!confirm(`¿Eliminar a ${email} de la lista de líderes autorizados?`)) return;
    Store.borrarLider(email);
    this.render();
  },

  /* ---------- Tesorería ---------- */
  cambiarTesTipo(tipo) {
    this.ui.tesTipo = tipo;
    this.render();
  },

  nuevaCategoriaTesoreria() {
    const tipo = document.getElementById('tes-tipo').value;
    const nombre = (prompt(`Nombre de la nueva categoría de ${tipo === 'ingreso' ? 'ingreso' : 'gasto'}:`) || '').trim();
    if (!nombre) return;
    Store.nuevaCategoriaTesoreria(tipo, nombre);
    this.render();
  },

  nuevoMovimiento() {
    const tipo = document.getElementById('tes-tipo').value;
    const categoriaId = document.getElementById('tes-categoria').value;
    const retiroId = document.getElementById('tes-retiro').value || null;
    const concepto = document.getElementById('tes-concepto').value;
    const importe = document.getElementById('tes-importe').value;
    const fecha = document.getElementById('tes-fecha').value;
    if (!categoriaId) { alert('Elige una categoría.'); return; }
    if (!importe || Number(importe) <= 0) { alert('Escribe un importe válido.'); return; }
    Store.nuevoMovimiento({ tipo, categoriaId, retiroId, concepto, importe, fecha });
    this.render();
  },

  quitarMovimiento(id) {
    if (!confirm('¿Eliminar este movimiento?')) return;
    Store.borrarMovimiento(id);
    this.render();
  },

  guardarPlantillas() {
    Store.guardarPlantillas({
      emailAsunto: document.getElementById('aj-email-asunto').value,
      emailCuerpo: document.getElementById('aj-email-cuerpo').value,
      whatsapp: document.getElementById('aj-wa').value,
      emailActividadAsunto: document.getElementById('aj-act-asunto').value,
      emailActividadCuerpo: document.getElementById('aj-act-cuerpo').value
    });
    Store.guardarAjustes({ enlaceBase: document.getElementById('aj-enlace').value.trim() });
    this.render();
    alert('Plantillas guardadas.');
  },

  async cerrarSesion() {
    await Store.cerrarSesion();
    this.pantallaLogin();
  },

  /* ============ Arranque: sesión, carga y login ============ */
  async init() {
    this.pantallaCarga();
    await Store.cargarSesion();
    if (!Store.sesion) { this.pantallaLogin(); return; }
    await this.entrarAlPanel();
  },

  // Se dispara cuando cambia el estado de sesión (enlace mágico recién pulsado, cierre de sesión en otra pestaña…)
  async onCambioSesion() {
    if (Store.sesion && !Store.db) await this.entrarAlPanel();
    else if (!Store.sesion) this.pantallaLogin();
  },

  async entrarAlPanel() {
    this.pantallaCarga();
    await Store.cargarMiRol();
    await Store.cargar();
    if (Store.miRol === 'material') this.ui.vista = 'inventario';
    else if (Store.miRol === 'actividades') this.ui.vista = 'actividades';
    else if (Store.miRol === 'tesoreria') this.ui.vista = 'tesoreria';
    this.render();
  },

  pantallaCarga() {
    document.getElementById('app').innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;height:100vh;width:100%;color:var(--texto-suave)">Cargando…</div>`;
  },

  pantallaLogin(mensaje) {
    document.getElementById('app').innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;height:100vh;width:100%;background:var(--fondo)">
        <div class="tarjeta" style="max-width:360px;width:92vw">
          <h2 style="margin-top:0">Emaús</h2>
          <p class="nota">Escribe tu email de líder y te enviaremos un enlace para entrar, sin contraseña.</p>
          ${mensaje ? `<p class="nota" style="color:var(--verde)">${esc(mensaje)}</p>` : ''}
          <div class="campo"><label>Email</label><input id="login-email" type="email" style="width:100%" placeholder="tu@email.com"></div>
          <button class="btn ambar" id="login-boton" style="width:100%" onclick="App.enviarEnlace()">Enviar enlace de acceso</button>
        </div>
      </div>`;
  },

  async enviarEnlace() {
    const email = document.getElementById('login-email').value.trim();
    if (!email) return;
    const boton = document.getElementById('login-boton');
    boton.textContent = 'Enviando…'; boton.disabled = true;
    const error = await Store.enviarEnlaceMagico(email);
    if (error) { alert('No se pudo enviar el enlace: ' + error.message); this.pantallaLogin(); return; }
    this.pantallaLogin(`Te hemos enviado un enlace a ${email}. Ábrelo desde este mismo dispositivo para entrar.`);
  }
};

App.init();
