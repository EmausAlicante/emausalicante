/* ============================================================
   Emaús · Formulario público de inscripción (sin login)
   Habla directo con Supabase: lectura pública de retiros/zonas/
   productos, y envío vía las funciones RPC inscribir_servidor /
   inscribir_caminante (toda la lógica de negocio vive ahí).
   ============================================================ */

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const TALLAS = ['S', 'M', 'L', 'XL', '2XL', '3XL'];

// Igual que en store.js: formatea a "+34 XXX XXX XXX" cualquier teléfono español de 9 dígitos.
function normalizarTelefono(v) {
  if (!v) return '';
  let digitos = String(v).replace(/\D/g, '');
  if (digitos.startsWith('0034') && digitos.length === 13) digitos = digitos.slice(4);
  else if (digitos.startsWith('34') && digitos.length === 11) digitos = digitos.slice(2);
  if (digitos.length !== 9) return String(v).trim();
  return `+34 ${digitos.slice(0, 3)} ${digitos.slice(3, 6)} ${digitos.slice(6, 9)}`;
}

function esc(s) {
  return String(s == null ? '' : s)
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function fmtFecha(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  return `${d} de ${meses[m - 1]} de ${y}`;
}

function fmtRango(inicioISO, finISO) {
  if (!inicioISO) return '';
  if (!finISO || finISO === inicioISO) return `el ${fmtFecha(inicioISO)}`;
  const [y1, m1, d1] = inicioISO.split('-').map(Number);
  const [y2, m2, d2] = finISO.split('-').map(Number);
  const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  if (y1 === y2 && m1 === m2) return `del ${d1} al ${d2} de ${meses[m1 - 1]} de ${y1}`;
  if (y1 === y2) return `del ${d1} de ${meses[m1 - 1]} al ${d2} de ${meses[m2 - 1]} de ${y1}`;
  return `del ${fmtFecha(inicioISO)} al ${fmtFecha(finISO)}`;
}

const raiz = document.getElementById('app');
const params = new URLSearchParams(location.search);
const retiroId = params.get('retiro');
let tipo = params.get('tipo');

function pantalla(html) { raiz.innerHTML = html; }

function urlConTipo(t) {
  const p = new URLSearchParams(location.search);
  p.set('tipo', t);
  return `${location.pathname}?${p.toString()}`;
}

async function iniciar() {
  pantalla('<p class="nota" style="margin-top:40px;text-align:center">Cargando…</p>');

  if (!retiroId) {
    pantalla('<div class="tarjeta vacio">Este enlace no indica ningún retiro. Pide al equipo de tu zona el enlace correcto.</div>');
    return;
  }

  const [{ data: retiro, error: errorRetiro }, { data: productos }] = await Promise.all([
    sb.from('retiros').select('*').eq('id', retiroId).maybeSingle(),
    sb.from('productos').select('*').order('nombre')
  ]);

  if (errorRetiro || !retiro) {
    pantalla('<div class="tarjeta vacio">No se ha encontrado este retiro. El enlace puede haber caducado.</div>');
    return;
  }

  const { data: zona } = await sb.from('zonas').select('*').eq('id', retiro.zona_id).maybeSingle();

  if (!tipo) { renderChooser(retiro, zona); return; }
  if (tipo === 'servidor') renderServidores(retiro, zona, productos || []);
  else renderCaminantes(retiro, zona);
}

function cabecera(retiro, zona, titulo, invitacion) {
  const precio = retiro.precio
    ? `<p style="margin:4px 0"><strong>Precio:</strong> ${retiro.precio} €${retiro.suplemento_individual ? ` · habitación individual: +${retiro.suplemento_individual} €` : ''}</p>`
    : '';
  return `
    <h3>${esc(titulo)}</h3>
    <p style="margin:4px 0"><strong>${esc(retiro.nombre)}</strong> · ${esc(zona?.nombre || '')}</p>
    <p style="margin:4px 0">📅 ${fmtRango(retiro.fecha_inicio, retiro.fecha_fin)} · 📍 ${esc(retiro.lugar || '')}</p>
    ${precio}
    ${invitacion ? `<div class="intro">${esc(invitacion)}</div>` : ''}
    ${retiro.info_extra ? `<div class="intro" style="margin-top:8px">${esc(retiro.info_extra)}</div>` : ''}`;
}

function renderChooser(retiro, zona) {
  pantalla(`
    <div class="form-publico">
      <h3>Inscripción · ${esc(retiro.nombre)}</h3>
      <p style="margin:4px 0">${esc(zona?.nombre || '')} · ${fmtRango(retiro.fecha_inicio, retiro.fecha_fin)}</p>
      <p class="nota" style="margin-top:14px">¿Cómo quieres participar?</p>
      <div class="acciones-linea" style="flex-direction:column;align-items:stretch;gap:10px;margin-top:10px">
        <a class="btn ambar" style="text-align:center" href="${urlConTipo('caminante')}">Quiero vivir mi Retiro de Emaús (caminante)</a>
        <a class="btn secundario" style="text-align:center" href="${urlConTipo('servidor')}">Ya viví mi retiro y quiero venir a servir</a>
      </div>
    </div>`);
}

function renderCaminantes(retiro, zona) {
  const invitacion = 'Te invitamos a vivir tu Retiro de Emaús: un fin de semana para parar, descansar y reencontrarte. No hace falta que traigas nada especial, solo ganas de venir.';
  pantalla(`
    <div class="form-publico">
      ${cabecera(retiro, zona, 'Inscripción de CAMINANTES', invitacion)}
      <h4>Datos personales</h4>
      <div class="grid2">
        <div class="campo"><label>Nombre *</label><input id="fp-nombre" style="width:100%"></div>
        <div class="campo"><label>Apellidos *</label><input id="fp-apellidos" style="width:100%"></div>
        <div class="campo"><label>Teléfono *</label><input id="fp-telefono" style="width:100%"></div>
        <div class="campo"><label>Email</label><input id="fp-email" type="email" style="width:100%"></div>
        <div class="campo"><label>DNI</label><input id="fp-dni" style="width:100%"></div>
        <div class="campo"><label>Fecha de nacimiento</label><input id="fp-nacimiento" type="date" style="width:100%"></div>
      </div>
      <h4>¿Quién te ha invitado?</h4>
      <div class="grid2">
        <div class="campo"><label>¿Quién te ha invitado a este retiro?</label><input id="fp-invito" style="width:100%"></div>
        <div class="campo"><label>Teléfono del mismo</label><input id="fp-invito-tel" style="width:100%"></div>
      </div>
      <div class="campo"><label class="check-linea"><input type="checkbox" id="fp-transporte"> ¿Necesitas transporte para ir al lugar del retiro?</label></div>
      <h4>Personas de contacto</h4>
      <p class="nota">Nos sirven para el equipo de Palancas, que acompaña a los caminantes durante el retiro.</p>
      <div class="grid2">
        <div class="campo"><label>Contacto 1 — nombre y apellidos</label><input id="fp-c1-nombre" style="width:100%"></div>
        <div class="campo"><label>Contacto 1 — teléfono</label><input id="fp-c1-tel" style="width:100%"></div>
        <div class="campo"><label>Contacto 1 — relación</label><input id="fp-c1-rel" placeholder="Esposa, Hijo, Hermana, Padres, Amigos…" style="width:100%"></div>
        <div class="campo"><label>Contacto 2 — nombre y apellidos</label><input id="fp-c2-nombre" style="width:100%"></div>
        <div class="campo"><label>Contacto 2 — teléfono</label><input id="fp-c2-tel" style="width:100%"></div>
        <div class="campo"><label>Contacto 2 — relación</label><input id="fp-c2-rel" placeholder="Esposa, Hijo, Hermana, Padres, Amigos…" style="width:100%"></div>
      </div>
      <div id="fp-error" class="nota" style="color:var(--rojo)"></div>
      <button class="btn ambar" id="fp-enviar" style="width:100%;margin-top:14px">Enviar inscripción</button>
    </div>`);

  document.getElementById('fp-enviar').onclick = async () => {
    const v = x => document.getElementById(x).value.trim();
    const errorEl = document.getElementById('fp-error');
    errorEl.textContent = '';
    if (!v('fp-nombre') || !v('fp-apellidos') || !v('fp-telefono')) {
      errorEl.textContent = 'Nombre, apellidos y teléfono son obligatorios.';
      return;
    }
    const boton = document.getElementById('fp-enviar');
    boton.disabled = true; boton.textContent = 'Enviando…';
    const { data, error } = await sb.rpc('inscribir_caminante', {
      p_retiro_id: retiro.id,
      p_nombre: v('fp-nombre'), p_apellidos: v('fp-apellidos'), p_telefono: normalizarTelefono(v('fp-telefono')),
      p_email: v('fp-email'), p_dni: v('fp-dni'), p_fecha_nacimiento: v('fp-nacimiento') || null,
      p_contacto1_nombre: v('fp-c1-nombre'), p_contacto1_telefono: normalizarTelefono(v('fp-c1-tel')), p_contacto1_relacion: v('fp-c1-rel'),
      p_contacto2_nombre: v('fp-c2-nombre'), p_contacto2_telefono: normalizarTelefono(v('fp-c2-tel')), p_contacto2_relacion: v('fp-c2-rel'),
      p_quien_invito: v('fp-invito'), p_telefono_invito: normalizarTelefono(v('fp-invito-tel')),
      p_necesita_transporte: document.getElementById('fp-transporte').checked
    });
    if (error) {
      errorEl.textContent = error.message;
      boton.disabled = false; boton.textContent = 'Enviar inscripción';
      return;
    }
    pantalla(`<div class="tarjeta" style="border-left:5px solid var(--verde)">
      <strong>✔ Inscripción registrada.</strong> ${esc(data.nombre)} ${esc(data.apellidos)} queda apuntado como caminante en «${esc(retiro.nombre)}».
    </div>`);
  };
}

function renderServidores(retiro, zona, productos) {
  const invitacion = 'Tú ya viviste la experiencia del retiro como caminante; ahora se te ofrece la oportunidad de servir. Durante el retiro todos somos útiles: no hay servicios mejores que otros, formamos parte de la misma misión.';
  const selectsEquipacion = productos.map(p => `
    <div class="campo"><label>${esc(p.nombre)}</label>
      <select id="fs-eq-${p.id}" style="width:100%">
        <option value="">— No necesito —</option>
        ${TALLAS.map(t => `<option>${t}</option>`).join('')}
      </select></div>`).join('');

  pantalla(`
    <div class="form-publico">
      ${cabecera(retiro, zona, 'Inscripción de SERVIDORES', invitacion)}

      <h4>Datos personales</h4>
      <div class="grid2">
        <div class="campo"><label>Nombre *</label><input id="fs-nombre" style="width:100%"></div>
        <div class="campo"><label>Apellidos *</label><input id="fs-apellidos" style="width:100%"></div>
        <div class="campo"><label>Teléfono *</label><input id="fs-telefono" style="width:100%"></div>
        <div class="campo"><label>Email *</label><input id="fs-email" type="email" style="width:100%"></div>
        <div class="campo"><label>Fecha de nacimiento</label><input id="fs-nacimiento" type="date" style="width:100%"></div>
        <div class="campo"><label>Dirección (calle y número)</label><input id="fs-direccion" style="width:100%"></div>
        <div class="campo"><label>Código postal</label><input id="fs-cp" style="width:100%"></div>
        <div class="campo"><label>Localidad</label><input id="fs-localidad" style="width:100%"></div>
      </div>

      <h4>Tu camino de Emaús</h4>
      <div class="campo"><label>¿Qué año y dónde viviste tu Retiro de Emaús? *</label>
        <input id="fs-camino" placeholder="Ej. 2022 · Parroquia San Juan (Madrid)" style="width:100%"></div>
      <div class="campo"><label>¿Es la primera vez que vas a servir en un retiro?</label>
        <select id="fs-primera" style="width:100%">
          <option value="Sí, es la primera vez">Sí, es la primera vez</option>
          <option value="No, ya he servido antes">No, ya he servido antes</option>
        </select></div>
      <div class="campo"><label>Si ya has servido antes, ¿dónde?</label>
        <input id="fs-donde-serviste" placeholder="Ej. Emaús Hombres Madrid" style="width:100%"></div>

      <h4>Equipación <span style="text-transform:none;font-weight:400">(elige la talla solo de lo que necesites)</span></h4>
      <div class="grid2">${selectsEquipacion}</div>

      <h4>Rutinas de descanso</h4>
      <div class="grid2">
        <div class="campo"><label>¿Roncas?</label>
          <select id="fs-ronca" style="width:100%">
            <option>No</option><option>Un poco, a veces</option><option>Sí, mucho</option>
          </select></div>
        <div class="campo"><label>¿Habitación individual?${retiro.suplemento_individual ? ` (+${retiro.suplemento_individual} €)` : ''}</label>
          <select id="fs-individual" style="width:100%">
            <option value="No">No es necesario</option><option value="Sí">Sí, la quiero</option>
          </select></div>
        <div class="campo"><label>¿Puedes dormir con alguien que ronca?</label>
          <select id="fs-con-roncador" style="width:100%">
            <option>Sí</option><option>Si no hace mucho ruido, sí</option><option>No, necesito silencio</option>
          </select></div>
        <div class="campo"><label>¿Compartir habitación con alguien en concreto?</label>
          <input id="fs-companero" placeholder="Nombre (opcional)" style="width:100%"></div>
      </div>

      <h4>Persona de contacto en caso de emergencia</h4>
      <div class="grid2">
        <div class="campo"><label>Nombre y apellidos *</label><input id="fs-em-nombre" style="width:100%"></div>
        <div class="campo"><label>Teléfono *</label><input id="fs-em-telefono" style="width:100%"></div>
        <div class="campo"><label>Relación (cónyuge, hijo/a…)</label><input id="fs-em-relacion" style="width:100%"></div>
      </div>

      <h4>Consentimiento</h4>
      <div class="grid2">
        <div class="campo"><label>DNI o NIE (sin puntos ni guiones) *</label><input id="fs-dni" style="width:100%"></div>
        <div class="campo"><label>Fecha de expedición del DNI (la pide el alojamiento)</label><input id="fs-dni-exp" type="date" style="width:100%"></div>
      </div>
      <label class="check-linea"><input type="checkbox" id="fs-privacidad"> Acepto la política de privacidad y el tratamiento de mis datos para la organización del retiro. *</label>

      <div id="fs-error" class="nota" style="color:var(--rojo)"></div>
      <button class="btn ambar" id="fs-enviar" style="width:100%;margin-top:14px">Enviar inscripción de servidor</button>
    </div>`);

  document.getElementById('fs-enviar').onclick = async () => {
    const v = x => (document.getElementById(x)?.value || '').trim();
    const chk = x => !!document.getElementById(x)?.checked;
    const errorEl = document.getElementById('fs-error');
    errorEl.textContent = '';

    if (!v('fs-nombre') || !v('fs-apellidos') || !v('fs-telefono') || !v('fs-email') || !v('fs-dni')) {
      errorEl.textContent = 'Faltan datos obligatorios: nombre, apellidos, teléfono, email y DNI.';
      return;
    }
    if (!chk('fs-privacidad')) {
      errorEl.textContent = 'Es necesario aceptar la política de privacidad.';
      return;
    }

    const pedidoEquipacion = productos
      .map(p => ({ producto_id: p.id, talla: v(`fs-eq-${p.id}`) }))
      .filter(x => x.talla);

    const boton = document.getElementById('fs-enviar');
    boton.disabled = true; boton.textContent = 'Enviando…';

    const { data, error } = await sb.rpc('inscribir_servidor', {
      p_retiro_id: retiro.id,
      p_nombre: v('fs-nombre'), p_apellidos: v('fs-apellidos'), p_telefono: normalizarTelefono(v('fs-telefono')),
      p_email: v('fs-email'), p_dni: v('fs-dni'), p_fecha_nacimiento: v('fs-nacimiento') || null,
      p_direccion: v('fs-direccion'), p_cp: v('fs-cp'), p_localidad: v('fs-localidad'),
      p_camino_origen: v('fs-camino'), p_primera_vez: v('fs-primera'), p_donde_sirvio: v('fs-donde-serviste'),
      p_ronca: v('fs-ronca'), p_habitacion_individual: v('fs-individual'), p_dormir_con_roncador: v('fs-con-roncador'),
      p_companero_habitacion: v('fs-companero'),
      p_emergencia_nombre: v('fs-em-nombre'), p_emergencia_telefono: normalizarTelefono(v('fs-em-telefono')), p_emergencia_relacion: v('fs-em-relacion'),
      p_dni_expedicion: v('fs-dni-exp') || null, p_privacidad_aceptada: true,
      p_pedido_equipacion: pedidoEquipacion
    });

    if (error) {
      errorEl.textContent = error.message;
      boton.disabled = false; boton.textContent = 'Enviar inscripción de servidor';
      return;
    }

    let msgEquipacion = '';
    const items = data.pedido_equipacion || [];
    if (items.length) {
      const nStock = items.filter(x => x.estado === 'stock').length;
      const nPedido = items.length - nStock;
      msgEquipacion = ` Equipación: ${nStock} reservada${nStock === 1 ? '' : 's'} de almacén${nPedido ? `, ${nPedido} pendiente${nPedido === 1 ? '' : 's'} de pedir` : ''}.`;
    }
    pantalla(`<div class="tarjeta" style="border-left:5px solid var(--verde)">
      <strong>✔ Inscripción registrada.</strong> ${esc(data.nombre)} ${esc(data.apellidos)} queda inscrito como servidor en «${esc(retiro.nombre)}».${msgEquipacion}
    </div>`);
  };
}

iniciar();
