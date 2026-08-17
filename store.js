/* ============================================================
   Emaús · Gestión de retiros — capa de datos (v2, Supabase)
   Store.db es una caché local con la MISMA forma que antes en
   localStorage. Cada mutación cambia esa caché al instante (para
   que la interfaz responda igual de rápido que siempre) y además
   dispara en segundo plano la persistencia real en Supabase.
   Un canal de Realtime fusiona los cambios de otros líderes.
   ============================================================ */

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function uid() {
  return crypto.randomUUID();
}

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

// Normaliza a "+34 XXX XXX XXX" cualquier teléfono español de 9 dígitos, venga como venga
// (con o sin prefijo, con espacios/puntos/guiones...). Si no son 9 dígitos limpios (número
// extranjero, incompleto, etc.), lo deja tal cual en vez de intentar adivinar mal.
function normalizarTelefono(v) {
  if (!v) return '';
  let digitos = String(v).replace(/\D/g, '');
  if (digitos.startsWith('0034') && digitos.length === 13) digitos = digitos.slice(4);
  else if (digitos.startsWith('34') && digitos.length === 11) digitos = digitos.slice(2);
  if (digitos.length !== 9) return String(v).trim();
  return `+34 ${digitos.slice(0, 3)} ${digitos.slice(3, 6)} ${digitos.slice(6, 9)}`;
}

const TALLAS = ['S', 'M', 'L', 'XL', '2XL', '3XL'];

/* ---------- Traducción entre la forma de la app (camelCase) y las tablas (snake_case) ---------- */
function contactoDesdeDB(r) {
  return {
    id: r.id, zonaId: r.zona_id, nombre: r.nombre, apellidos: r.apellidos,
    dni: r.dni || '', fechaNacimiento: r.fecha_nacimiento, email: r.email || '', telefono: r.telefono || '',
    fechaRetiro: r.fecha_retiro, direccion: r.direccion || '', cp: r.cp || '', localidad: r.localidad || '',
    fechaExpedicionDni: r.fecha_expedicion_dni, serviciosPrevios: r.servicios_previos || 0,
    tallaPolo: r.talla_polo || '', ronca: r.ronca || '', duermeConRoncador: r.duerme_con_roncador || '',
    companeroPreferido: r.companero_preferido || '', contactoEmergenciaNombre: r.contacto_emergencia_nombre || '',
    contactoEmergenciaTelefono: r.contacto_emergencia_telefono || '', contactoEmergenciaRelacion: r.contacto_emergencia_relacion || '',
    parroquiaCamino: r.parroquia_camino || '', politicaAceptada: !!r.politica_aceptada, alergias: r.alergias || '',
    estadoCivil: r.estado_civil || ''
  };
}
function contactoADB(c) {
  return {
    id: c.id, zona_id: c.zonaId, nombre: c.nombre || '', apellidos: c.apellidos || '',
    dni: c.dni || '', fecha_nacimiento: c.fechaNacimiento || null, email: c.email || '', telefono: c.telefono || '',
    fecha_retiro: c.fechaRetiro || null, direccion: c.direccion || '', cp: c.cp || '', localidad: c.localidad || '',
    fecha_expedicion_dni: c.fechaExpedicionDni || null, servicios_previos: c.serviciosPrevios || 0,
    talla_polo: c.tallaPolo || '', ronca: c.ronca || '', duerme_con_roncador: c.duermeConRoncador || '',
    companero_preferido: c.companeroPreferido || '', contacto_emergencia_nombre: c.contactoEmergenciaNombre || '',
    contacto_emergencia_telefono: c.contactoEmergenciaTelefono || '', contacto_emergencia_relacion: c.contactoEmergenciaRelacion || '',
    parroquia_camino: c.parroquiaCamino || '', politica_aceptada: !!c.politicaAceptada, alergias: c.alergias || '',
    estado_civil: c.estadoCivil || ''
  };
}

function equipoDesdeDB(e) {
  return {
    zonaId: e.zona_id, anio: e.anio, alias: e.alias || '',
    lider: { contactoId: e.lider_contacto_id },
    colideres: [{ contactoId: e.colider1_contacto_id }, { contactoId: e.colider2_contacto_id }]
  };
}
function equipoADB(zonaId, anio, equipo) {
  return {
    zona_id: zonaId, anio, alias: equipo.alias || '',
    lider_contacto_id: equipo.lider?.contactoId || null,
    colider1_contacto_id: equipo.colideres?.[0]?.contactoId || null,
    colider2_contacto_id: equipo.colideres?.[1]?.contactoId || null
  };
}

function retiroDesdeDB(r) {
  return {
    id: r.id, zonaId: r.zona_id, nombre: r.nombre, fechaInicio: r.fecha_inicio, fechaFin: r.fecha_fin,
    lugar: r.lugar || '', precio: r.precio, suplementoIndividual: r.suplemento_individual, infoExtra: r.info_extra || '',
    creado: r.creado, cerrado: r.cerrado, acta: r.acta || null, angelitos: r.angelitos || 0,
    precioAngelito: r.precio_angelito
  };
}
function retiroADB(r) {
  return {
    id: r.id, zona_id: r.zonaId, nombre: r.nombre, fecha_inicio: r.fechaInicio, fecha_fin: r.fechaFin,
    lugar: r.lugar || '', precio: r.precio === '' || r.precio == null ? null : r.precio,
    suplemento_individual: r.suplementoIndividual === '' || r.suplementoIndividual == null ? null : r.suplementoIndividual,
    info_extra: r.infoExtra || '', creado: r.creado, cerrado: !!r.cerrado, acta: r.acta || null,
    angelitos: r.angelitos || 0,
    precio_angelito: r.precioAngelito === '' || r.precioAngelito == null ? null : r.precioAngelito
  };
}

function inscripcionDesdeDB(r) {
  return {
    id: r.id, retiroId: r.retiro_id, contactoId: r.contacto_id, papel: r.papel, estado: r.estado,
    pagado: r.pagado, metodoPago: r.metodo_pago || '', notas: r.notas || '', detalles: r.detalles || null,
    palancasContacto1Nombre: r.palancas_contacto1_nombre || '', palancasContacto1Telefono: r.palancas_contacto1_telefono || '',
    palancasContacto1Relacion: r.palancas_contacto1_relacion || '', palancasContacto2Nombre: r.palancas_contacto2_nombre || '',
    palancasContacto2Telefono: r.palancas_contacto2_telefono || '', palancasContacto2Relacion: r.palancas_contacto2_relacion || '',
    palancasQuienInvito: r.palancas_quien_invito || '', palancasTelefonoInvito: r.palancas_telefono_invito || '',
    palancasNecesitaTransporte: !!r.palancas_necesita_transporte, palancasMesa: r.palancas_mesa || '',
    palancasAsignadoA: r.palancas_asignado_a || null, palancasContactado: !!r.palancas_contactado,
    llegado: !!r.llegado, importePagado: Number(r.importe_pagado) || 0, mesaConoceA: r.mesa_conoce_a || '',
    etiquetaImpresa: !!r.etiqueta_impresa, fotoHecha: !!r.foto_hecha, esAngelito: !!r.es_angelito,
    palancasContacto1Email: r.palancas_contacto1_email || '', palancasContacto2Email: r.palancas_contacto2_email || '',
    palancasEmailInvito: r.palancas_email_invito || '', familiaresDomingo: r.familiares_domingo || ''
  };
}
function inscripcionADB(i) {
  return {
    id: i.id, retiro_id: i.retiroId, contacto_id: i.contactoId, papel: i.papel, estado: i.estado || 'pendiente',
    pagado: !!i.pagado, metodo_pago: i.metodoPago || '', notas: i.notas || '', detalles: i.detalles || null,
    palancas_contacto1_nombre: i.palancasContacto1Nombre || '', palancas_contacto1_telefono: i.palancasContacto1Telefono || '',
    palancas_contacto1_relacion: i.palancasContacto1Relacion || '', palancas_contacto2_nombre: i.palancasContacto2Nombre || '',
    palancas_contacto2_telefono: i.palancasContacto2Telefono || '', palancas_contacto2_relacion: i.palancasContacto2Relacion || '',
    palancas_quien_invito: i.palancasQuienInvito || '', palancas_telefono_invito: i.palancasTelefonoInvito || '',
    palancas_necesita_transporte: !!i.palancasNecesitaTransporte, palancas_mesa: i.palancasMesa || '',
    palancas_asignado_a: i.palancasAsignadoA || null, palancas_contactado: !!i.palancasContactado,
    llegado: !!i.llegado, importe_pagado: Number(i.importePagado) || 0, mesa_conoce_a: i.mesaConoceA || '',
    etiqueta_impresa: !!i.etiquetaImpresa, foto_hecha: !!i.fotoHecha, es_angelito: !!i.esAngelito,
    palancas_contacto1_email: i.palancasContacto1Email || '', palancas_contacto2_email: i.palancasContacto2Email || '',
    palancas_email_invito: i.palancasEmailInvito || '', familiares_domingo: i.familiaresDomingo || ''
  };
}

function accionDesdeDB(a) {
  return { id: a.id, retiroId: a.retiro_id, titulo: a.titulo, contactoId: a.contacto_id, fechaLimite: a.fecha_limite, hecha: a.hecha };
}
function accionADB(a) {
  return { id: a.id, retiro_id: a.retiroId, titulo: a.titulo, contacto_id: a.contactoId || null, fecha_limite: a.fechaLimite || null, hecha: !!a.hecha };
}

function documentoDesdeDB(d) {
  return { id: d.id, retiroId: d.retiro_id, titulo: d.titulo, enlace: d.enlace || '', listo: d.listo, notas: d.notas || '' };
}
function documentoADB(d) {
  return { id: d.id, retiro_id: d.retiroId, titulo: d.titulo, enlace: d.enlace || '', listo: !!d.listo, notas: d.notas || '' };
}

function actividadDesdeDB(a, asistentesFilas) {
  return {
    id: a.id, zonaId: a.zona_id, retiroId: a.retiro_id || null, titulo: a.titulo, fecha: a.fecha, hora: a.hora || '',
    lugar: a.lugar || '', enlaceUbicacion: a.enlace_ubicacion || '', diasAntes: a.dias_antes,
    programa: a.programa || '', avisos: a.avisos || '',
    asistentes: asistentesFilas.filter(x => x.actividad_id === a.id).map(x => x.contacto_id)
  };
}
function actividadADB(a) {
  return {
    id: a.id, zona_id: a.zonaId, retiro_id: a.retiroId || null, titulo: a.titulo, fecha: a.fecha, hora: a.hora || '',
    lugar: a.lugar || '', enlace_ubicacion: a.enlaceUbicacion || '', dias_antes: a.diasAntes === undefined ? 2 : a.diasAntes,
    programa: a.programa || '', avisos: a.avisos || ''
  };
}

function cartaDesdeDB(c) {
  return { id: c.id, retiroId: c.retiro_id, contactoId: c.contacto_id, numero: c.numero, remitente: c.remitente || '', fecha: c.fecha, impresa: c.impresa, notas: c.notas || '' };
}
function cartaADB(c) {
  return { id: c.id, retiro_id: c.retiroId, contacto_id: c.contactoId, numero: c.numero, remitente: c.remitente || '', fecha: c.fecha, impresa: !!c.impresa, notas: c.notas || '' };
}

/* ---------- Store ---------- */
const Store = {
  db: null,
  sesion: null,
  _canal: null,

  /* ---------- Sesión (enlace mágico) ---------- */
  async cargarSesion() {
    const { data } = await sb.auth.getSession();
    this.sesion = data.session;
    sb.auth.onAuthStateChange((_evento, session) => {
      this.sesion = session;
      if (window.App && App.onCambioSesion) App.onCambioSesion();
    });
    return this.sesion;
  },

  async cargarMiRol() {
    const { data, error } = await sb.rpc('mi_rol');
    this.miRol = error ? null : (data || null);
    return this.miRol;
  },

  async enviarEnlaceMagico(email) {
    const { error } = await sb.auth.signInWithOtp({
      email, options: { emailRedirectTo: window.location.origin + window.location.pathname }
    });
    return error;
  },

  async cerrarSesion() {
    await sb.auth.signOut();
    this.sesion = null;
  },

  /* ---------- Carga inicial: trae todas las tablas y arma Store.db ---------- */
  async cargar() {
    const [
      zonasR, contactosR, equiposR, retirosR, inscripcionesR, accionesR,
      documentosR, actividadesR, asistentesR, cartasR,
      productosR, stockR, pedidosR, orgR, ajustesR, plantillasR, lideresR,
      categoriasTesR, movimientosTesR, habitacionesR, ocupantesR, palancasEquipoR, administracionEquipoR, formasPagoR,
      mesasR, mesaCaminantesR, cocinaEquipoR, tareaResponsablesR, materialesR, megafoniaEquipoR
    ] = await Promise.all([
      sb.from('zonas').select('*').order('nombre'),
      sb.from('contactos').select('*'),
      sb.from('equipos').select('*'),
      sb.from('retiros').select('*'),
      sb.from('inscripciones').select('*'),
      sb.from('acciones').select('*'),
      sb.from('documentos').select('*'),
      sb.from('actividades').select('*'),
      sb.from('actividad_asistentes').select('*'),
      sb.from('cartas').select('*'),
      sb.from('productos').select('*').order('nombre'),
      sb.from('stock').select('*'),
      sb.from('pedidos_prendas').select('*'),
      sb.from('organizacion').select('*').maybeSingle(),
      sb.from('ajustes').select('*').maybeSingle(),
      sb.from('plantillas').select('*').maybeSingle(),
      sb.from('lideres').select('*').order('creado_en'),
      sb.from('categorias_tesoreria').select('*').order('tipo').order('nombre'),
      sb.from('movimientos_tesoreria').select('*').order('fecha', { ascending: false }),
      sb.from('habitaciones').select('*'),
      sb.from('habitacion_ocupantes').select('*'),
      sb.from('retiro_palancas_equipo').select('*'),
      sb.from('retiro_administracion_equipo').select('*'),
      sb.from('formas_pago').select('*').order('nombre'),
      sb.from('mesas').select('*'),
      sb.from('mesa_caminantes').select('*'),
      sb.from('retiro_cocina_equipo').select('*'),
      sb.from('retiro_tarea_responsables').select('*'),
      sb.from('materiales').select('*').order('nombre'),
      sb.from('retiro_megafonia_equipo').select('*')
    ]);

    this.db = {
      organizacion: { nombre: orgR.data?.nombre || 'Mi comunidad de Emaús', logo: orgR.data?.logo_url || null },
      ajustes: { enlaceBase: ajustesR.data?.enlace_base || '' },
      zonas: (zonasR.data || []).map(z => ({ id: z.id, nombre: z.nombre, tipo: z.tipo })),
      contactos: (contactosR.data || []).map(contactoDesdeDB),
      equipos: (equiposR.data || []).map(equipoDesdeDB),
      retiros: (retirosR.data || []).map(retiroDesdeDB),
      inscripciones: (inscripcionesR.data || []).map(inscripcionDesdeDB),
      acciones: (accionesR.data || []).map(accionDesdeDB),
      documentos: (documentosR.data || []).map(documentoDesdeDB),
      actividades: (actividadesR.data || []).map(a => actividadDesdeDB(a, asistentesR.data || [])),
      cartas: (cartasR.data || []).map(cartaDesdeDB),
      inventario: {
        productos: (productosR.data || []).map(p => ({ id: p.id, nombre: p.nombre, color: p.color })),
        stock: (stockR.data || []).map(s => ({ productoId: s.producto_id, talla: s.talla, cantidad: s.cantidad })),
        pedidos: (pedidosR.data || []).map(p => ({ id: p.id, productoId: p.producto_id, talla: p.talla, contactoId: p.contacto_id, retiroId: p.retiro_id, fecha: p.fecha, atendido: p.atendido }))
      },
      materiales: (materialesR.data || []).map(m => ({
        id: m.id, nombre: m.nombre,
        porCaminante: m.por_caminante || 0, porServidor: m.por_servidor || 0, porAngelito: m.por_angelito || 0,
        extraFijo: m.extra_fijo || 0, stockActual: m.stock_actual, esDeBolsa: m.es_de_bolsa, categoria: m.categoria || 'retiro'
      })),
      plantillas: plantillasR.data ? {
        emailAsunto: plantillasR.data.email_asunto || '', emailCuerpo: plantillasR.data.email_cuerpo || '',
        whatsapp: plantillasR.data.whatsapp || '',
        emailActividadAsunto: plantillasR.data.email_actividad_asunto || '', emailActividadCuerpo: plantillasR.data.email_actividad_cuerpo || ''
      } : { emailAsunto: '', emailCuerpo: '', whatsapp: '', emailActividadAsunto: '', emailActividadCuerpo: '' },
      lideres: (lideresR.data || []).map(l => ({ email: l.email, nombre: l.nombre || '', activo: l.activo, rol: l.rol || 'coordinador' })),
      tesoreria: {
        categorias: (categoriasTesR.data || []).map(c => ({ id: c.id, tipo: c.tipo, nombre: c.nombre })),
        movimientos: (movimientosTesR.data || []).map(m => ({
          id: m.id, tipo: m.tipo, categoriaId: m.categoria_id, retiroId: m.retiro_id,
          concepto: m.concepto || '', importe: Number(m.importe), fecha: m.fecha, creadoPor: m.creado_por || ''
        }))
      },
      habitaciones: (habitacionesR.data || []).map(h => ({ id: h.id, retiroId: h.retiro_id, nombre: h.nombre || '', capacidad: h.capacidad, papel: h.papel })),
      habitacionOcupantes: (ocupantesR.data || []).map(o => ({ habitacionId: o.habitacion_id, contactoId: o.contacto_id, retiroId: o.retiro_id })),
      palancasEquipo: (palancasEquipoR.data || []).map(p => ({ retiroId: p.retiro_id, contactoId: p.contacto_id, rol: p.rol })),
      administracionEquipo: (administracionEquipoR.data || []).map(p => ({ retiroId: p.retiro_id, contactoId: p.contacto_id, rol: p.rol })),
      formasPago: (formasPagoR.data || []).map(f => ({ id: f.id, nombre: f.nombre })),
      mesas: (mesasR.data || []).map(m => ({ id: m.id, retiroId: m.retiro_id, nombre: m.nombre || '', liderContactoId: m.lider_contacto_id, coliderContactoId: m.colider_contacto_id })),
      mesaCaminantes: (mesaCaminantesR.data || []).map(m => ({ mesaId: m.mesa_id, contactoId: m.contacto_id, retiroId: m.retiro_id })),
      cocinaEquipo: (cocinaEquipoR.data || []).map(p => ({ retiroId: p.retiro_id, contactoId: p.contacto_id, rol: p.rol })),
      megafoniaEquipo: (megafoniaEquipoR.data || []).map(p => ({ retiroId: p.retiro_id, contactoId: p.contacto_id, rol: p.rol })),
      tareaResponsables: (tareaResponsablesR.data || []).map(t => ({ retiroId: t.retiro_id, tarea: t.tarea, contactoId: t.contacto_id }))
    };

    this.suscribirRealtime();
    return this.db;
  },

  // Fusiona en Store.db los cambios que hagan otros líderes en vivo (sin recargar la página)
  suscribirRealtime() {
    if (this._canal) return;
    const porTabla = {
      zonas: { arr: 'zonas', mapa: z => ({ id: z.id, nombre: z.nombre, tipo: z.tipo }) },
      contactos: { arr: 'contactos', mapa: contactoDesdeDB },
      retiros: { arr: 'retiros', mapa: retiroDesdeDB },
      inscripciones: { arr: 'inscripciones', mapa: inscripcionDesdeDB },
      acciones: { arr: 'acciones', mapa: accionDesdeDB },
      documentos: { arr: 'documentos', mapa: documentoDesdeDB },
      cartas: { arr: 'cartas', mapa: cartaDesdeDB }
    };
    this._canal = sb.channel('emaus-cambios');
    for (const tabla of Object.keys(porTabla)) {
      this._canal.on('postgres_changes', { event: '*', schema: 'public', table: tabla }, payload => {
        const { arr, mapa } = porTabla[tabla];
        const lista = this.db[arr];
        if (payload.eventType === 'DELETE') {
          this.db[arr] = lista.filter(x => x.id !== payload.old.id);
        } else {
          const nuevo = mapa(payload.new);
          const idx = lista.findIndex(x => x.id === nuevo.id);
          if (idx >= 0) lista[idx] = nuevo; else lista.push(nuevo);
        }
        if (window.App) App.render();
      });
    }
    this._canal.on('postgres_changes', { event: '*', schema: 'public', table: 'equipos' }, payload => {
      if (payload.eventType === 'DELETE') {
        this.db.equipos = this.db.equipos.filter(e => !(e.zonaId === payload.old.zona_id && e.anio === payload.old.anio));
      } else {
        const nuevo = equipoDesdeDB(payload.new);
        const idx = this.db.equipos.findIndex(e => e.zonaId === nuevo.zonaId && e.anio === nuevo.anio);
        if (idx >= 0) this.db.equipos[idx] = nuevo; else this.db.equipos.push(nuevo);
      }
      if (window.App) App.render();
    });
    this._canal.subscribe();
  },

  // Persistencia en segundo plano: la mutación local ya ha ocurrido, esto solo confirma en el servidor
  async _persist(promesa, mensajeError) {
    const { error } = await promesa;
    if (error) {
      console.error(error);
      alert((mensajeError || 'No se pudo guardar el cambio') + ':\n' + error.message);
    }
  },

  /* ---------- Consultas (leen de Store.db; sin cambios respecto a la versión local) ---------- */
  zona(id) { return this.db.zonas.find(z => z.id === id); },
  contacto(id) { return this.db.contactos.find(c => c.id === id); },
  retiro(id) { return this.db.retiros.find(r => r.id === id); },

  // Un contacto es SERVIDOR si tiene fecha de retiro vivida (pasada); si no, CAMINANTE.
  esServidor(c) {
    return !!c.fechaRetiro && c.fechaRetiro <= hoyISO();
  },
  tipo(c) {
    return this.esServidor(c) ? 'servidor' : 'caminante';
  },

  contactosDeZona(zonaId) {
    return this.db.contactos.filter(c => zonaId === 'all' || c.zonaId === zonaId);
  },

  servidoresDeZona(zonaId) {
    return this.contactosDeZona(zonaId).filter(c => this.esServidor(c));
  },

  equipoDe(zonaId, anio) {
    return this.db.equipos.find(e => e.zonaId === zonaId && e.anio === anio);
  },

  // Rol de un contacto en el equipo vigente de su zona (para mostrar alias)
  rolDe(contactoId) {
    const anio = new Date().getFullYear();
    for (const e of this.db.equipos) {
      if (e.anio !== anio) continue;
      if (e.lider && e.lider.contactoId === contactoId) return { rol: 'Líder', alias: e.alias, zonaId: e.zonaId };
      for (const co of e.colideres || []) {
        if (co.contactoId === contactoId) return { rol: 'Colíder', alias: e.alias, zonaId: e.zonaId };
      }
    }
    return null;
  },

  // ¿Ha servido en algún retiro ya celebrado antes de la fecha de referencia?
  // También cuenta si en su formulario declaró que ya había servido (p. ej. en otra ciudad).
  haServidoAntes(contactoId, referenciaISO) {
    const ref = referenciaISO || hoyISO();
    const c = this.contacto(contactoId);
    if (c && (c.serviciosPrevios || 0) > 0) return true;
    for (const i of this.db.inscripciones) {
      if (i.contactoId !== contactoId || i.papel !== 'servidor') continue;
      const r = this.retiro(i.retiroId);
      if (r && r.fechaFin < ref) return true;
      if (i.detalles && /^no/i.test(i.detalles.primeraVez || '')) return true;
    }
    return false;
  },

  // Próximo retiro (aún no celebrado) en el que está inscrito como servidor
  sirveEn(contactoId) {
    const hoy = hoyISO();
    const proximos = this.db.inscripciones
      .filter(i => i.contactoId === contactoId && i.papel === 'servidor')
      .map(i => this.retiro(i.retiroId))
      .filter(r => r && r.fechaFin >= hoy)
      .sort((a, b) => a.fechaInicio.localeCompare(b.fechaInicio));
    return proximos[0] || null;
  },

  // ¿Ha sido líder algún otro año? No se puede repetir como líder; como colíder sí.
  haSidoLider(contactoId, exceptoAnio) {
    return this.db.equipos.some(e =>
      e.lider && e.lider.contactoId === contactoId && e.anio !== exceptoAnio);
  },

  // Historial de servicio en equipos de un contacto, del más reciente al más antiguo
  historialRoles(contactoId) {
    const res = [];
    for (const e of this.db.equipos) {
      if (e.lider && e.lider.contactoId === contactoId) {
        res.push({ anio: e.anio, zonaId: e.zonaId, alias: e.alias, rol: 'Líder' });
      }
      for (const co of e.colideres || []) {
        if (co.contactoId === contactoId) {
          res.push({ anio: e.anio, zonaId: e.zonaId, alias: e.alias, rol: 'Colíder' });
        }
      }
    }
    return res.sort((a, b) => b.anio - a.anio);
  },

  inscripcionesDe(retiroId) {
    return this.db.inscripciones.filter(i => i.retiroId === retiroId);
  },

  accionesDe(retiroId) {
    return this.db.acciones.filter(a => a.retiroId === retiroId);
  },

  retirosProximos(zonaId) {
    return this.db.retiros
      .filter(r => (zonaId === 'all' || r.zonaId === zonaId) && r.fechaFin >= hoyISO())
      .sort((a, b) => a.fechaInicio.localeCompare(b.fechaInicio));
  },

  /* ---------- Mutaciones: cambian Store.db al instante y persisten en Supabase en segundo plano ---------- */
  guardarContacto(datos) {
    if ('telefono' in datos) datos.telefono = normalizarTelefono(datos.telefono);
    if ('contactoEmergenciaTelefono' in datos) datos.contactoEmergenciaTelefono = normalizarTelefono(datos.contactoEmergenciaTelefono);
    if (datos.id) {
      const c = this.contacto(datos.id);
      Object.assign(c, datos);
      this._persist(sb.from('contactos').upsert(contactoADB(c)), 'No se pudo guardar el contacto');
    } else {
      datos.id = uid();
      this.db.contactos.push(datos);
      this._persist(sb.from('contactos').insert(contactoADB(datos)), 'No se pudo crear el contacto');
    }
    return datos.id;
  },

  /* Alta masiva: se reutiliza guardarContacto() en bucle desde App.importarServidoresExcel,
     así que no hace falta un método aparte aquí. */

  borrarContacto(id) {
    this.db.contactos = this.db.contactos.filter(c => c.id !== id);
    this.db.inscripciones = this.db.inscripciones.filter(i => i.contactoId !== id);
    this.db.cartas = this.db.cartas.filter(c => c.contactoId !== id);
    this.db.actividades.forEach(a => { a.asistentes = (a.asistentes || []).filter(x => x !== id); });
    this.db.acciones.forEach(a => { if (a.contactoId === id) a.contactoId = null; });
    this.db.equipos.forEach(e => {
      if (e.lider && e.lider.contactoId === id) e.lider = { contactoId: null };
      (e.colideres || []).forEach(co => { if (co.contactoId === id) co.contactoId = null; });
    });
    // El resto (inscripciones/cartas/asistencias/acciones/equipos) se limpia solo en el servidor vía ON DELETE
    this._persist(sb.from('contactos').delete().eq('id', id), 'No se pudo eliminar el contacto');
  },

  guardarRetiro(datos) {
    if (datos.id) {
      Object.assign(this.retiro(datos.id), datos);
      this._persist(sb.from('retiros').upsert(retiroADB(this.retiro(datos.id))), 'No se pudo guardar el retiro');
    } else {
      datos.id = uid();
      datos.cerrado = false;
      datos.creado = hoyISO();
      this.db.retiros.push(datos);
      this._persist(sb.from('retiros').insert(retiroADB(datos)), 'No se pudo crear el retiro');
      // La recepción de caminantes es prácticamente fija: siempre el primer día, sobre las 18:00.
      this.guardarActividad({
        zonaId: datos.zonaId, retiroId: datos.id, titulo: 'Recepción de caminantes',
        fecha: datos.fechaInicio, hora: '18:00', lugar: datos.lugar || '', diasAntes: 2
      });
    }
    return datos.id;
  },

  // Acta: foto permanente de participantes y acciones, con los nombres tal cual eran en ese momento.
  // No se altera aunque después se editen o eliminen contactos.
  generarActa(retiroId) {
    const participantes = this.inscripcionesDe(retiroId).map(i => {
      const c = this.contacto(i.contactoId);
      return {
        nombre: c ? `${c.nombre} ${c.apellidos}` : '(contacto eliminado)',
        dni: c ? (c.dni || '') : '',
        telefono: c ? (c.telefono || '') : '',
        papel: i.papel, estado: i.estado,
        pagado: !!i.pagado, metodoPago: i.metodoPago || '', notas: i.notas || ''
      };
    });
    const acciones = this.accionesDe(retiroId).map(a => {
      const c = a.contactoId ? this.contacto(a.contactoId) : null;
      return {
        titulo: a.titulo,
        responsable: c ? `${c.nombre} ${c.apellidos}` : '',
        fechaLimite: a.fechaLimite || '', hecha: !!a.hecha
      };
    });
    return { cerradoEl: hoyISO(), participantes, acciones };
  },

  // Cerrar retiro: se graba el acta y los caminantes inscritos pasan a servidores
  cerrarRetiro(retiroId) {
    const r = this.retiro(retiroId);
    r.acta = this.generarActa(retiroId);
    r.cerrado = true;
    let convertidos = 0;
    const contactosConvertidos = [];
    for (const ins of this.inscripcionesDe(retiroId)) {
      if (ins.papel === 'caminante') {
        const c = this.contacto(ins.contactoId);
        if (c && !c.fechaRetiro) { c.fechaRetiro = r.fechaInicio; convertidos++; contactosConvertidos.push(c); }
      }
    }
    this._persist(sb.from('retiros').update({ cerrado: true, acta: r.acta }).eq('id', retiroId), 'No se pudo cerrar el retiro');
    for (const c of contactosConvertidos) {
      this._persist(sb.from('contactos').update({ fecha_retiro: c.fechaRetiro }).eq('id', c.id), 'No se pudo actualizar un contacto convertido a servidor');
    }
    return convertidos;
  },

  inscribir(retiroId, contactoId, papel, detalles) {
    const ya = this.db.inscripciones.find(i => i.retiroId === retiroId && i.contactoId === contactoId);
    if (ya) {
      if (papel) ya.papel = papel;
      if (detalles) ya.detalles = detalles;
      this._persist(sb.from('inscripciones').update({ papel: ya.papel, detalles: ya.detalles }).eq('id', ya.id), 'No se pudo actualizar la inscripción');
      return ya.id;
    }
    const ins = { id: uid(), retiroId, contactoId, papel, estado: 'pendiente', detalles: detalles || null, pagado: false, metodoPago: '', notas: '' };
    this.db.inscripciones.push(ins);
    this._persist(sb.from('inscripciones').insert(inscripcionADB(ins)), 'No se pudo crear la inscripción');
    return ins.id;
  },

  actualizarInscripcion(id, campos) {
    const i = this.db.inscripciones.find(x => x.id === id);
    if (!i) return;
    ['palancasContacto1Telefono', 'palancasContacto2Telefono', 'palancasTelefonoInvito'].forEach(campo => {
      if (campo in campos) campos[campo] = normalizarTelefono(campos[campo]);
    });
    Object.assign(i, campos);
    const camposDB = {};
    if ('estado' in campos) camposDB.estado = i.estado;
    if ('pagado' in campos) camposDB.pagado = i.pagado;
    if ('metodoPago' in campos) camposDB.metodo_pago = i.metodoPago;
    if ('notas' in campos) camposDB.notas = i.notas;
    if ('papel' in campos) camposDB.papel = i.papel;
    if ('detalles' in campos) camposDB.detalles = i.detalles;
    const mapaPalancas = {
      palancasContacto1Nombre: 'palancas_contacto1_nombre', palancasContacto1Telefono: 'palancas_contacto1_telefono',
      palancasContacto1Relacion: 'palancas_contacto1_relacion', palancasContacto2Nombre: 'palancas_contacto2_nombre',
      palancasContacto2Telefono: 'palancas_contacto2_telefono', palancasContacto2Relacion: 'palancas_contacto2_relacion',
      palancasQuienInvito: 'palancas_quien_invito', palancasTelefonoInvito: 'palancas_telefono_invito',
      palancasNecesitaTransporte: 'palancas_necesita_transporte', palancasMesa: 'palancas_mesa',
      palancasAsignadoA: 'palancas_asignado_a', palancasContactado: 'palancas_contactado',
      llegado: 'llegado', importePagado: 'importe_pagado', mesaConoceA: 'mesa_conoce_a', etiquetaImpresa: 'etiqueta_impresa',
      fotoHecha: 'foto_hecha', esAngelito: 'es_angelito',
      palancasContacto1Email: 'palancas_contacto1_email', palancasContacto2Email: 'palancas_contacto2_email',
      palancasEmailInvito: 'palancas_email_invito', familiaresDomingo: 'familiares_domingo'
    };
    for (const campo in mapaPalancas) if (campo in campos) camposDB[mapaPalancas[campo]] = i[campo];
    this._persist(sb.from('inscripciones').update(camposDB).eq('id', id), 'No se pudo actualizar la inscripción');
  },

  borrarInscripcion(id) {
    this.db.inscripciones = this.db.inscripciones.filter(i => i.id !== id);
    this._persist(sb.from('inscripciones').delete().eq('id', id), 'No se pudo quitar la inscripción');
  },

  guardarAccion(datos) {
    if (datos.id) {
      Object.assign(this.db.acciones.find(a => a.id === datos.id), datos);
      this._persist(sb.from('acciones').upsert(accionADB(this.db.acciones.find(a => a.id === datos.id))), 'No se pudo guardar la acción');
    } else {
      datos.id = uid();
      this.db.acciones.push(datos);
      this._persist(sb.from('acciones').insert(accionADB(datos)), 'No se pudo crear la acción');
    }
  },

  guardarEquipo(zonaId, anio, equipo) {
    const idx = this.db.equipos.findIndex(e => e.zonaId === zonaId && e.anio === anio);
    const registro = { zonaId, anio, ...equipo };
    if (idx >= 0) this.db.equipos[idx] = registro; else this.db.equipos.push(registro);
    this._persist(sb.from('equipos').upsert(equipoADB(zonaId, anio, equipo)), 'No se pudo guardar el equipo');
  },

  borrarEquipo(zonaId, anio) {
    this.db.equipos = this.db.equipos.filter(e => !(e.zonaId === zonaId && e.anio === anio));
    this._persist(sb.from('equipos').delete().eq('zona_id', zonaId).eq('anio', anio), 'No se pudo quitar el equipo');
  },

  actividad(id) { return this.db.actividades.find(a => a.id === id); },

  // Total de veces que ha servido: retiros registrados + servicios anteriores a la app (campo manual)
  vecesServido(contactoId) {
    const c = this.contacto(contactoId);
    return this.serviciosDe(contactoId).length + ((c && c.serviciosPrevios) || 0);
  },

  // Retiros en los que YA sirvió (celebrados), del más reciente al más antiguo
  serviciosDe(contactoId) {
    const hoy = hoyISO();
    return this.db.inscripciones
      .filter(i => i.contactoId === contactoId && i.papel === 'servidor')
      .map(i => this.retiro(i.retiroId))
      .filter(r => r && r.fechaFin < hoy)
      .sort((a, b) => b.fechaInicio.localeCompare(a.fechaInicio));
  },

  // Acciones que tiene o tuvo encomendadas, con su retiro (la más reciente primero)
  accionesDeContacto(contactoId) {
    return this.db.acciones
      .filter(a => a.contactoId === contactoId)
      .map(a => ({ ...a, retiro: this.retiro(a.retiroId) }))
      .filter(x => x.retiro)
      .sort((a, b) => b.retiro.fechaInicio.localeCompare(a.retiro.fechaInicio));
  },

  // Responsables asignables a acciones de un retiro: servidores inscritos en él + equipo vigente de la zona
  responsablesDeRetiro(retiroId) {
    const r = this.retiro(retiroId);
    if (!r) return [];
    const inscritosServ = this.inscripcionesDe(retiroId)
      .filter(i => i.papel === 'servidor')
      .map(i => this.contacto(i.contactoId))
      .filter(Boolean);
    const posibles = [...inscritosServ];
    for (const m of this.miembrosEquipo(r.zonaId)) {
      if (!posibles.some(c => c.id === m.id)) posibles.push(m);
    }
    return posibles;
  },

  // Equipo vigente de la zona (líder + colíderes) como contactos
  miembrosEquipo(zonaId) {
    const e = this.equipoDe(zonaId, new Date().getFullYear());
    if (!e) return [];
    const ids = [e.lider?.contactoId, ...(e.colideres || []).map(co => co.contactoId)].filter(Boolean);
    return ids.map(id => this.contacto(id)).filter(Boolean);
  },

  // Actividades a las que asistió, de la más reciente a la más antigua
  actividadesDe(contactoId) {
    return this.db.actividades
      .filter(a => (a.asistentes || []).includes(contactoId))
      .sort((a, b) => b.fecha.localeCompare(a.fecha));
  },

  marcarAsistencia(actividadId, contactoId, asiste) {
    const a = this.actividad(actividadId);
    if (!a.asistentes) a.asistentes = [];
    if (asiste && !a.asistentes.includes(contactoId)) {
      a.asistentes.push(contactoId);
      this._persist(sb.from('actividad_asistentes').insert({ actividad_id: actividadId, contacto_id: contactoId }), 'No se pudo registrar la asistencia');
    }
    if (!asiste) {
      a.asistentes = a.asistentes.filter(x => x !== contactoId);
      this._persist(sb.from('actividad_asistentes').delete().eq('actividad_id', actividadId).eq('contacto_id', contactoId), 'No se pudo quitar la asistencia');
    }
  },

  guardarActividad(datos) {
    if (datos.id) {
      Object.assign(this.actividad(datos.id), datos);
      this._persist(sb.from('actividades').upsert(actividadADB(this.actividad(datos.id))), 'No se pudo guardar la actividad');
    } else {
      datos.id = uid();
      datos.asistentes = datos.asistentes || [];
      this.db.actividades.push(datos);
      this._persist(sb.from('actividades').insert(actividadADB(datos)), 'No se pudo crear la actividad');
    }
    return datos.id;
  },

  borrarActividad(id) {
    this.db.actividades = this.db.actividades.filter(a => a.id !== id);
    this._persist(sb.from('actividades').delete().eq('id', id), 'No se pudo eliminar la actividad');
  },

  /* ---------- Documentos del retiro ---------- */
  documentosDe(retiroId) {
    return this.db.documentos.filter(d => d.retiroId === retiroId);
  },

  guardarDocumento(datos) {
    if (datos.id) {
      Object.assign(this.db.documentos.find(d => d.id === datos.id), datos);
      this._persist(sb.from('documentos').upsert(documentoADB(this.db.documentos.find(d => d.id === datos.id))), 'No se pudo guardar el documento');
    } else {
      datos.id = uid();
      this.db.documentos.push(datos);
      this._persist(sb.from('documentos').insert(documentoADB(datos)), 'No se pudo crear el documento');
    }
  },

  borrarDocumento(id) {
    this.db.documentos = this.db.documentos.filter(d => d.id !== id);
    this._persist(sb.from('documentos').delete().eq('id', id), 'No se pudo eliminar el documento');
  },

  /* ---------- Cartas a los caminantes ---------- */
  cartasDe(retiroId) {
    return this.db.cartas.filter(c => c.retiroId === retiroId);
  },

  cartasDeCaminante(retiroId, contactoId) {
    return this.cartasDe(retiroId).filter(c => c.contactoId === contactoId).sort((a, b) => a.numero - b.numero);
  },

  siguienteNumeroCarta(retiroId, contactoId) {
    const nums = this.cartasDeCaminante(retiroId, contactoId).map(c => c.numero);
    return nums.length ? Math.max(...nums) + 1 : 1;
  },

  guardarCarta(datos) {
    if (datos.id) {
      Object.assign(this.db.cartas.find(c => c.id === datos.id), datos);
      this._persist(sb.from('cartas').upsert(cartaADB(this.db.cartas.find(c => c.id === datos.id))), 'No se pudo guardar la carta');
    } else {
      datos.id = uid();
      this.db.cartas.push(datos);
      this._persist(sb.from('cartas').insert(cartaADB(datos)), 'No se pudo crear la carta');
    }
  },

  borrarCarta(id) {
    this.db.cartas = this.db.cartas.filter(c => c.id !== id);
    this._persist(sb.from('cartas').delete().eq('id', id), 'No se pudo eliminar la carta');
  },

  // Fecha del "día de en medio" del retiro: límite recomendado para recibir cartas
  diaEnMedio(retiro) {
    const ini = new Date(retiro.fechaInicio + 'T12:00:00');
    const fin = new Date(retiro.fechaFin + 'T12:00:00');
    return new Date(ini.getTime() + Math.floor((fin - ini) / 2)).toISOString().slice(0, 10);
  },

  /* ---------- Inventario de ropa ---------- */
  producto(id) { return this.db.inventario.productos.find(p => p.id === id); },

  stockDe(productoId, talla) {
    const s = this.db.inventario.stock.find(x => x.productoId === productoId && x.talla === talla);
    return s ? s.cantidad : 0;
  },

  fijarStock(productoId, talla, cantidad) {
    let s = this.db.inventario.stock.find(x => x.productoId === productoId && x.talla === talla);
    if (s) s.cantidad = cantidad;
    else this.db.inventario.stock.push({ productoId, talla, cantidad });
    this._persist(sb.from('stock').upsert({ producto_id: productoId, talla, cantidad }), 'No se pudo guardar el stock');
  },

  // Al pedir una prenda: si hay stock se reserva (se descuenta); si no, se apunta en la lista de pedidos pendientes.
  // El formulario público usa la función RPC del servidor (más segura frente a peticiones simultáneas);
  // esto se mantiene para una posible reserva manual desde dentro de la app.
  pedirPrenda(productoId, talla, contactoId, retiroId) {
    const s = this.db.inventario.stock.find(x => x.productoId === productoId && x.talla === talla);
    const disp = s ? s.cantidad : 0;
    let resultado;
    if (disp > 0) {
      s.cantidad = disp - 1;
      resultado = 'stock';
      this._persist(sb.from('stock').update({ cantidad: s.cantidad }).eq('producto_id', productoId).eq('talla', talla), 'No se pudo actualizar el stock');
    } else {
      const pedido = { id: uid(), productoId, talla, contactoId, retiroId, fecha: hoyISO(), atendido: false };
      this.db.inventario.pedidos.push(pedido);
      this._persist(sb.from('pedidos_prendas').insert({
        id: pedido.id, producto_id: productoId, talla, contacto_id: contactoId, retiro_id: retiroId, fecha: pedido.fecha, atendido: false
      }), 'No se pudo registrar el pedido');
      resultado = 'pedido';
    }
    return resultado;
  },

  /* ---------- Materiales generales (bolsas, sobres, papelería, etc.) ---------- */
  fijarStockMaterial(id, stockActual) {
    const m = this.db.materiales.find(x => x.id === id);
    if (!m) return;
    m.stockActual = stockActual;
    this._persist(sb.from('materiales').update({ stock_actual: stockActual }).eq('id', id), 'No se pudo guardar el stock del material');
  },

  fijarPorCaminanteMaterial(id, porCaminante) {
    const m = this.db.materiales.find(x => x.id === id);
    if (!m) return;
    m.porCaminante = porCaminante;
    this._persist(sb.from('materiales').update({ por_caminante: porCaminante }).eq('id', id), 'No se pudo guardar la cantidad del material');
  },

  fijarPorServidorMaterial(id, porServidor) {
    const m = this.db.materiales.find(x => x.id === id);
    if (!m) return;
    m.porServidor = porServidor;
    this._persist(sb.from('materiales').update({ por_servidor: porServidor }).eq('id', id), 'No se pudo guardar la cantidad del material');
  },

  fijarExtraMaterial(id, extraFijo) {
    const m = this.db.materiales.find(x => x.id === id);
    if (!m) return;
    m.extraFijo = extraFijo;
    this._persist(sb.from('materiales').update({ extra_fijo: extraFijo }).eq('id', id), 'No se pudo guardar el margen extra del material');
  },

  // Cuántas unidades de un material hacen falta para un retiro concreto, según cuántos
  // caminantes/servidores estén inscritos (o una cantidad fija, no ligada a inscritos).
  necesarioMaterial(material, retiroId) {
    const inscritos = this.inscripcionesDe(retiroId);
    const nCaminantes = inscritos.filter(i => i.papel === 'caminante').length;
    const nServidores = inscritos.filter(i => i.papel === 'servidor').length;
    return nCaminantes * material.porCaminante + nServidores * material.porServidor + material.extraFijo;
  },

  // Resumen de materiales para un retiro: lo necesario, lo que ya hay en stock y lo que falta comprar.
  resumenMaterialesRetiro(retiroId) {
    return this.db.materiales.map(m => {
      const necesario = this.necesarioMaterial(m, retiroId);
      const aComprar = Math.max(0, necesario - m.stockActual);
      return { material: m, necesario, aComprar };
    });
  },

  // Caminantes de un retiro con la talla de polo que pidieron en su bolsa (para las etiquetas).
  bolsasCaminantesDe(retiroId) {
    return this.inscripcionesDe(retiroId)
      .filter(i => i.papel === 'caminante')
      .map(i => {
        const c = this.contacto(i.contactoId);
        const pedido = (i.detalles?.pedidoEquipacion || [])[0];
        return c ? { contacto: c, tallaPolo: pedido?.talla || '—' } : null;
      })
      .filter(Boolean);
  },

  marcarPedidoAtendido(id, atendido) {
    const p = this.db.inventario.pedidos.find(x => x.id === id);
    if (p) {
      p.atendido = atendido;
      this._persist(sb.from('pedidos_prendas').update({ atendido }).eq('id', id), 'No se pudo actualizar el pedido');
    }
  },

  borrarPedido(id) {
    this.db.inventario.pedidos = this.db.inventario.pedidos.filter(x => x.id !== id);
    this._persist(sb.from('pedidos_prendas').delete().eq('id', id), 'No se pudo eliminar el pedido');
  },

  nuevaZona(nombre, tipo) {
    const z = { id: uid(), nombre, tipo };
    this.db.zonas.push(z);
    this._persist(sb.from('zonas').insert({ id: z.id, nombre, tipo }), 'No se pudo crear la zona');
    return z;
  },

  /* ---------- Organización, plantillas y ajustes ---------- */
  // cambios: { nombre?, logo?, logoBlob? } — logoBlob dispara la subida a Supabase Storage
  guardarOrganizacion(cambios) {
    if (cambios.nombre !== undefined) this.db.organizacion.nombre = cambios.nombre;
    if (cambios.logo !== undefined) this.db.organizacion.logo = cambios.logo;

    if (cambios.logoBlob) {
      (async () => {
        const ruta = `logo-${Date.now()}.png`;
        const { error: errorSubida } = await sb.storage.from('logos').upload(ruta, cambios.logoBlob, { upsert: true });
        if (errorSubida) { alert('No se pudo subir el logotipo: ' + errorSubida.message); return; }
        const { data } = sb.storage.from('logos').getPublicUrl(ruta);
        this.db.organizacion.logo = data.publicUrl;
        await this._persist(sb.from('organizacion').update({ logo_url: data.publicUrl }).eq('id', 1), 'No se pudo guardar el logotipo');
        if (window.App) App.render();
      })();
      return;
    }

    this._persist(sb.from('organizacion').update({
      nombre: this.db.organizacion.nombre, logo_url: this.db.organizacion.logo
    }).eq('id', 1), 'No se pudo guardar la organización');
  },

  guardarPlantillas(campos) {
    Object.assign(this.db.plantillas, campos);
    this._persist(sb.from('plantillas').update({
      email_asunto: this.db.plantillas.emailAsunto,
      email_cuerpo: this.db.plantillas.emailCuerpo,
      whatsapp: this.db.plantillas.whatsapp,
      email_actividad_asunto: this.db.plantillas.emailActividadAsunto,
      email_actividad_cuerpo: this.db.plantillas.emailActividadCuerpo
    }).eq('id', 1), 'No se pudieron guardar las plantillas');
  },

  guardarAjustes(campos) {
    Object.assign(this.db.ajustes, campos);
    this._persist(sb.from('ajustes').update({ enlace_base: this.db.ajustes.enlaceBase }).eq('id', 1), 'No se pudieron guardar los ajustes');
  },

  /* ---------- Líderes autorizados ----------
     Lista blanca que decide quién puede obtener sesión (ver trigger en
     schema.sql sobre auth.users). Que alguien ya tenga sesión abierta
     no le impide gestionar esta lista: un único nivel de confianza,
     igual que el resto de la app. */
  nuevoLider(email, nombre, rol) {
    email = email.trim().toLowerCase();
    rol = ['coordinador','material','tesoreria','actividades'].includes(rol) ? rol : 'coordinador';
    if (!email || this.db.lideres.some(l => l.email === email)) return;
    const l = { email, nombre: (nombre || '').trim(), activo: true, rol };
    this.db.lideres.push(l);
    this._persist(sb.from('lideres').insert({ email: l.email, nombre: l.nombre, activo: true, rol }), 'No se pudo dar de alta al líder');
  },

  alternarLider(email, activo) {
    const l = this.db.lideres.find(x => x.email === email);
    if (!l) return;
    l.activo = activo;
    this._persist(sb.from('lideres').update({ activo }).eq('email', email), 'No se pudo actualizar el líder');
  },

  cambiarRolLider(email, rol) {
    if (!['coordinador','material','tesoreria','actividades'].includes(rol)) return;
    const l = this.db.lideres.find(x => x.email === email);
    if (!l) return;
    l.rol = rol;
    this._persist(sb.from('lideres').update({ rol }).eq('email', email), 'No se pudo actualizar el rol');
  },

  borrarLider(email) {
    this.db.lideres = this.db.lideres.filter(l => l.email !== email);
    this._persist(sb.from('lideres').delete().eq('email', email), 'No se pudo eliminar el líder');
  },

  /* ---------- Tesorería ---------- */
  nuevaCategoriaTesoreria(tipo, nombre) {
    nombre = (nombre || '').trim();
    if (!nombre || !['ingreso', 'gasto'].includes(tipo)) return null;
    const existente = this.db.tesoreria.categorias.find(c => c.tipo === tipo && c.nombre.toLowerCase() === nombre.toLowerCase());
    if (existente) return existente;
    const c = { id: crypto.randomUUID(), tipo, nombre };
    this.db.tesoreria.categorias.push(c);
    this._persist(sb.from('categorias_tesoreria').insert({ id: c.id, tipo, nombre }), 'No se pudo crear la categoría');
    return c;
  },

  nuevoMovimiento(datos) {
    const m = {
      id: crypto.randomUUID(), tipo: datos.tipo, categoriaId: datos.categoriaId,
      retiroId: datos.retiroId || null, concepto: (datos.concepto || '').trim(),
      importe: Number(datos.importe) || 0, fecha: datos.fecha || new Date().toISOString().slice(0, 10),
      creadoPor: this.sesion?.user?.email || ''
    };
    if (m.importe <= 0) return null;
    this.db.tesoreria.movimientos.unshift(m);
    this._persist(sb.from('movimientos_tesoreria').insert({
      id: m.id, tipo: m.tipo, categoria_id: m.categoriaId, retiro_id: m.retiroId,
      concepto: m.concepto, importe: m.importe, fecha: m.fecha, creado_por: m.creadoPor
    }), 'No se pudo guardar el movimiento');
    return m;
  },

  borrarMovimiento(id) {
    this.db.tesoreria.movimientos = this.db.tesoreria.movimientos.filter(m => m.id !== id);
    this._persist(sb.from('movimientos_tesoreria').delete().eq('id', id), 'No se pudo eliminar el movimiento');
  },

  /* ---------- Habitaciones ---------- */
  habitacionesDe(retiroId) {
    return this.db.habitaciones.filter(h => h.retiroId === retiroId);
  },
  ocupantesDe(habitacionId) {
    return this.db.habitacionOcupantes.filter(o => o.habitacionId === habitacionId)
      .map(o => this.contacto(o.contactoId)).filter(Boolean);
  },
  habitacionDeContacto(retiroId, contactoId) {
    const o = this.db.habitacionOcupantes.find(x => x.retiroId === retiroId && x.contactoId === contactoId);
    return o ? this.db.habitaciones.find(h => h.id === o.habitacionId) : null;
  },

  crearHabitacion(retiroId, nombre, capacidad, papel) {
    const h = { id: uid(), retiroId, nombre: nombre || '', capacidad, papel };
    this.db.habitaciones.push(h);
    this._persist(sb.from('habitaciones').insert({ id: h.id, retiro_id: retiroId, nombre: h.nombre, capacidad, papel }), 'No se pudo crear la habitación');
    return h.id;
  },
  borrarHabitacion(id) {
    this.db.habitaciones = this.db.habitaciones.filter(h => h.id !== id);
    this.db.habitacionOcupantes = this.db.habitacionOcupantes.filter(o => o.habitacionId !== id);
    this._persist(sb.from('habitaciones').delete().eq('id', id), 'No se pudo eliminar la habitación');
  },

  // Asigna a alguien a una habitación, quitándolo antes de cualquier otra habitación del MISMO retiro
  // (nadie puede estar en dos a la vez). Si habitacionId es null, solo lo desasigna.
  async asignarOcupante(retiroId, contactoId, habitacionId) {
    this.db.habitacionOcupantes = this.db.habitacionOcupantes.filter(o => !(o.retiroId === retiroId && o.contactoId === contactoId));
    await this._persist(sb.from('habitacion_ocupantes').delete().eq('retiro_id', retiroId).eq('contacto_id', contactoId), 'No se pudo actualizar la habitación');
    if (habitacionId) {
      this.db.habitacionOcupantes.push({ habitacionId, contactoId, retiroId });
      this._persist(sb.from('habitacion_ocupantes').insert({ habitacion_id: habitacionId, contacto_id: contactoId, retiro_id: retiroId }), 'No se pudo asignar la habitación');
    }
  },

  /* ---------- Equipo de Palancas (responsable + ayudantes, por retiro) ---------- */
  equipoPalancasDe(retiroId) {
    const filas = this.db.palancasEquipo.filter(p => p.retiroId === retiroId);
    return {
      responsable: filas.find(p => p.rol === 'responsable')?.contactoId || null,
      ayudantes: filas.filter(p => p.rol === 'ayudante').map(p => p.contactoId)
    };
  },
  asignarResponsablePalancas(retiroId, contactoId) {
    this.db.palancasEquipo = this.db.palancasEquipo.filter(p => !(p.retiroId === retiroId && (p.rol === 'responsable' || p.contactoId === contactoId)));
    this._persist(sb.from('retiro_palancas_equipo').delete().eq('retiro_id', retiroId).eq('rol', 'responsable'), 'No se pudo asignar el responsable');
    this._persist(sb.from('retiro_palancas_equipo').delete().eq('retiro_id', retiroId).eq('contacto_id', contactoId), 'No se pudo asignar el responsable');
    if (contactoId) {
      this.db.palancasEquipo.push({ retiroId, contactoId, rol: 'responsable' });
      this._persist(sb.from('retiro_palancas_equipo').insert({ retiro_id: retiroId, contacto_id: contactoId, rol: 'responsable' }), 'No se pudo asignar el responsable');
    }
  },
  agregarAyudantePalancas(retiroId, contactoId) {
    if (this.db.palancasEquipo.some(p => p.retiroId === retiroId && p.contactoId === contactoId)) return;
    this.db.palancasEquipo.push({ retiroId, contactoId, rol: 'ayudante' });
    this._persist(sb.from('retiro_palancas_equipo').insert({ retiro_id: retiroId, contacto_id: contactoId, rol: 'ayudante' }), 'No se pudo añadir el ayudante');
  },
  quitarDePalancas(retiroId, contactoId) {
    this.db.palancasEquipo = this.db.palancasEquipo.filter(p => !(p.retiroId === retiroId && p.contactoId === contactoId));
    this._persist(sb.from('retiro_palancas_equipo').delete().eq('retiro_id', retiroId).eq('contacto_id', contactoId), 'No se pudo quitar del equipo de Palancas');
  },

  /* ---------- Equipo de Cocina (un responsable + varios ayudantes, por retiro) ---------- */
  equipoCocinaDe(retiroId) {
    const filas = this.db.cocinaEquipo.filter(p => p.retiroId === retiroId);
    return {
      responsable: filas.find(p => p.rol === 'responsable')?.contactoId || null,
      ayudantes: filas.filter(p => p.rol === 'ayudante').map(p => p.contactoId)
    };
  },
  asignarResponsableCocina(retiroId, contactoId) {
    this.db.cocinaEquipo = this.db.cocinaEquipo.filter(p => !(p.retiroId === retiroId && (p.rol === 'responsable' || p.contactoId === contactoId)));
    this._persist(sb.from('retiro_cocina_equipo').delete().eq('retiro_id', retiroId).eq('rol', 'responsable'), 'No se pudo asignar el responsable');
    this._persist(sb.from('retiro_cocina_equipo').delete().eq('retiro_id', retiroId).eq('contacto_id', contactoId), 'No se pudo asignar el responsable');
    if (contactoId) {
      this.db.cocinaEquipo.push({ retiroId, contactoId, rol: 'responsable' });
      this._persist(sb.from('retiro_cocina_equipo').insert({ retiro_id: retiroId, contacto_id: contactoId, rol: 'responsable' }), 'No se pudo asignar el responsable');
    }
  },
  agregarAyudanteCocina(retiroId, contactoId) {
    if (this.db.cocinaEquipo.some(p => p.retiroId === retiroId && p.contactoId === contactoId)) return;
    this.db.cocinaEquipo.push({ retiroId, contactoId, rol: 'ayudante' });
    this._persist(sb.from('retiro_cocina_equipo').insert({ retiro_id: retiroId, contacto_id: contactoId, rol: 'ayudante' }), 'No se pudo añadir el ayudante');
  },
  quitarDeCocina(retiroId, contactoId) {
    this.db.cocinaEquipo = this.db.cocinaEquipo.filter(p => !(p.retiroId === retiroId && p.contactoId === contactoId));
    this._persist(sb.from('retiro_cocina_equipo').delete().eq('retiro_id', retiroId).eq('contacto_id', contactoId), 'No se pudo quitar del equipo de Cocina');
  },

  /* ---------- Equipo de Megafonía (un responsable + ayudantes, por retiro) ---------- */
  equipoMegafoniaDe(retiroId) {
    const filas = this.db.megafoniaEquipo.filter(p => p.retiroId === retiroId);
    return {
      responsable: filas.find(p => p.rol === 'responsable')?.contactoId || null,
      ayudantes: filas.filter(p => p.rol === 'ayudante').map(p => p.contactoId)
    };
  },
  asignarResponsableMegafonia(retiroId, contactoId) {
    this.db.megafoniaEquipo = this.db.megafoniaEquipo.filter(p => !(p.retiroId === retiroId && (p.rol === 'responsable' || p.contactoId === contactoId)));
    this._persist(sb.from('retiro_megafonia_equipo').delete().eq('retiro_id', retiroId).eq('rol', 'responsable'), 'No se pudo asignar el responsable');
    this._persist(sb.from('retiro_megafonia_equipo').delete().eq('retiro_id', retiroId).eq('contacto_id', contactoId), 'No se pudo asignar el responsable');
    if (contactoId) {
      this.db.megafoniaEquipo.push({ retiroId, contactoId, rol: 'responsable' });
      this._persist(sb.from('retiro_megafonia_equipo').insert({ retiro_id: retiroId, contacto_id: contactoId, rol: 'responsable' }), 'No se pudo asignar el responsable');
    }
  },
  agregarAyudanteMegafonia(retiroId, contactoId) {
    if (this.db.megafoniaEquipo.some(p => p.retiroId === retiroId && p.contactoId === contactoId)) return;
    this.db.megafoniaEquipo.push({ retiroId, contactoId, rol: 'ayudante' });
    this._persist(sb.from('retiro_megafonia_equipo').insert({ retiro_id: retiroId, contacto_id: contactoId, rol: 'ayudante' }), 'No se pudo añadir el ayudante');
  },
  quitarDeMegafonia(retiroId, contactoId) {
    this.db.megafoniaEquipo = this.db.megafoniaEquipo.filter(p => !(p.retiroId === retiroId && p.contactoId === contactoId));
    this._persist(sb.from('retiro_megafonia_equipo').delete().eq('retiro_id', retiroId).eq('contacto_id', contactoId), 'No se pudo quitar del equipo de Megafonía');
  },

  /* ---------- Responsable de una tarea puntual (genérico, reutilizable para cualquier tarea futura) ---------- */
  responsableTarea(retiroId, tarea) {
    return this.db.tareaResponsables.find(t => t.retiroId === retiroId && t.tarea === tarea)?.contactoId || null;
  },
  setResponsableTarea(retiroId, tarea, contactoId) {
    this.db.tareaResponsables = this.db.tareaResponsables.filter(t => !(t.retiroId === retiroId && t.tarea === tarea));
    this._persist(sb.from('retiro_tarea_responsables').delete().eq('retiro_id', retiroId).eq('tarea', tarea), 'No se pudo asignar el responsable');
    if (contactoId) {
      this.db.tareaResponsables.push({ retiroId, tarea, contactoId });
      this._persist(sb.from('retiro_tarea_responsables').insert({ retiro_id: retiroId, tarea, contacto_id: contactoId }), 'No se pudo asignar el responsable');
    }
  },

  /* ---------- Equipo de Administración (hasta 2 responsables + varios ayudantes, por retiro) ---------- */
  equipoAdministracionDe(retiroId) {
    const filas = this.db.administracionEquipo.filter(p => p.retiroId === retiroId);
    return {
      responsables: filas.filter(p => p.rol === 'responsable').map(p => p.contactoId),
      ayudantes: filas.filter(p => p.rol === 'ayudante').map(p => p.contactoId)
    };
  },
  agregarAAdministracion(retiroId, contactoId, rol) {
    if (this.db.administracionEquipo.some(p => p.retiroId === retiroId && p.contactoId === contactoId)) return;
    this.db.administracionEquipo.push({ retiroId, contactoId, rol });
    this._persist(sb.from('retiro_administracion_equipo').insert({ retiro_id: retiroId, contacto_id: contactoId, rol }), 'No se pudo añadir al equipo de Administración');
  },
  quitarDeAdministracion(retiroId, contactoId) {
    this.db.administracionEquipo = this.db.administracionEquipo.filter(p => !(p.retiroId === retiroId && p.contactoId === contactoId));
    this._persist(sb.from('retiro_administracion_equipo').delete().eq('retiro_id', retiroId).eq('contacto_id', contactoId), 'No se pudo quitar del equipo de Administración');
  },

  /* ---------- Formas de pago (ampliables) ---------- */
  nuevaFormaPago(nombre) {
    nombre = (nombre || '').trim();
    if (!nombre) return null;
    const existente = this.db.formasPago.find(f => f.nombre.toLowerCase() === nombre.toLowerCase());
    if (existente) return existente;
    const f = { id: uid(), nombre };
    this.db.formasPago.push(f);
    this._persist(sb.from('formas_pago').insert({ id: f.id, nombre }), 'No se pudo crear la forma de pago');
    return f;
  },

  // Reformatea de golpe todos los teléfonos ya guardados (contactos e inscripciones) al
  // formato "+34 XXX XXX XXX". Solo toca los que de verdad cambian. Devuelve cuántos se tocaron.
  normalizarTelefonosExistentes() {
    let tocados = 0;
    this.db.contactos.forEach(c => {
      const t = normalizarTelefono(c.telefono), te = normalizarTelefono(c.contactoEmergenciaTelefono);
      if (t !== c.telefono || te !== c.contactoEmergenciaTelefono) {
        c.telefono = t; c.contactoEmergenciaTelefono = te;
        this._persist(sb.from('contactos').upsert(contactoADB(c)), 'No se pudo actualizar el teléfono');
        tocados++;
      }
    });
    this.db.inscripciones.forEach(i => {
      const t1 = normalizarTelefono(i.palancasContacto1Telefono), t2 = normalizarTelefono(i.palancasContacto2Telefono),
        ti = normalizarTelefono(i.palancasTelefonoInvito);
      if (t1 !== i.palancasContacto1Telefono || t2 !== i.palancasContacto2Telefono || ti !== i.palancasTelefonoInvito) {
        i.palancasContacto1Telefono = t1; i.palancasContacto2Telefono = t2; i.palancasTelefonoInvito = ti;
        this._persist(sb.from('inscripciones').update({
          palancas_contacto1_telefono: t1, palancas_contacto2_telefono: t2, palancas_telefono_invito: ti
        }).eq('id', i.id), 'No se pudo actualizar el teléfono');
        tocados++;
      }
    });
    return tocados;
  },

  /* ---------- Mesas (líder + colíder de mesa + 3-4 caminantes) ---------- */
  mesasDe(retiroId) {
    return this.db.mesas.filter(m => m.retiroId === retiroId);
  },
  caminantesDeMesa(mesaId) {
    return this.db.mesaCaminantes.filter(o => o.mesaId === mesaId).map(o => this.contacto(o.contactoId)).filter(Boolean);
  },
  mesaDeCaminante(retiroId, contactoId) {
    const o = this.db.mesaCaminantes.find(x => x.retiroId === retiroId && x.contactoId === contactoId);
    return o ? this.db.mesas.find(m => m.id === o.mesaId) : null;
  },
  crearMesa(retiroId, nombre) {
    const m = { id: uid(), retiroId, nombre: nombre || '', liderContactoId: null, coliderContactoId: null };
    this.db.mesas.push(m);
    this._persist(sb.from('mesas').insert({ id: m.id, retiro_id: retiroId, nombre: m.nombre }), 'No se pudo crear la mesa');
    return m.id;
  },
  borrarMesa(id) {
    this.db.mesas = this.db.mesas.filter(m => m.id !== id);
    this.db.mesaCaminantes = this.db.mesaCaminantes.filter(o => o.mesaId !== id);
    this._persist(sb.from('mesas').delete().eq('id', id), 'No se pudo eliminar la mesa');
  },
  setLiderMesa(mesaId, contactoId) {
    const m = this.db.mesas.find(x => x.id === mesaId); if (!m) return;
    m.liderContactoId = contactoId || null;
    this._persist(sb.from('mesas').update({ lider_contacto_id: m.liderContactoId }).eq('id', mesaId), 'No se pudo asignar el líder de mesa');
  },
  setColiderMesa(mesaId, contactoId) {
    const m = this.db.mesas.find(x => x.id === mesaId); if (!m) return;
    m.coliderContactoId = contactoId || null;
    this._persist(sb.from('mesas').update({ colider_contacto_id: m.coliderContactoId }).eq('id', mesaId), 'No se pudo asignar el colíder de mesa');
  },
  asignarCaminanteMesa(retiroId, contactoId, mesaId) {
    this.db.mesaCaminantes = this.db.mesaCaminantes.filter(o => !(o.retiroId === retiroId && o.contactoId === contactoId));
    this._persist(sb.from('mesa_caminantes').delete().eq('retiro_id', retiroId).eq('contacto_id', contactoId), 'No se pudo actualizar la mesa');
    if (mesaId) {
      this.db.mesaCaminantes.push({ mesaId, contactoId, retiroId });
      this._persist(sb.from('mesa_caminantes').insert({ mesa_id: mesaId, contacto_id: contactoId, retiro_id: retiroId }), 'No se pudo asignar la mesa');
    }
  },

  /* Sugerencia automática de mesas: al contrario que en habitaciones, aquí lo importante es
     que dos caminantes que se conocen (inscripciones.mesaConoceA, texto libre) NUNCA acaben en
     la misma mesa. Además, los de la misma zona van juntos (importante en retiros combinados
     entre zonas, ej. Elche + Benidorm) — solo se mezclan zonas si no queda otra mesa disponible.
     Solo asigna a quien todavía no tenga mesa. */
  sugerirAsignacionMesas(retiroId) {
    const normaliza = s => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    const inscritos = this.db.inscripciones.filter(i => i.retiroId === retiroId && i.papel === 'caminante');
    const mesas = this.db.mesas.filter(m => m.retiroId === retiroId);
    if (!mesas.length) return;

    const yaAsignado = contactoId => this.db.mesaCaminantes.some(o => o.retiroId === retiroId && o.contactoId === contactoId);
    const ocupacionCount = Object.fromEntries(mesas.map(m => [m.id, this.caminantesDeMesa(m.id).length]));
    const CAPACIDAD_CAMINANTES = 4; // 3-4 caminantes por mesa, además de líder+colíder

    const pendientes = inscritos.filter(i => !yaAsignado(i.contactoId));
    for (const ins of pendientes) {
      const persona = this.contacto(ins.contactoId);
      if (!persona) continue;
      const textoConoce = normaliza(ins.mesaConoceA);
      const validas = mesas.filter(m => {
        if (ocupacionCount[m.id] >= CAPACIDAD_CAMINANTES) return false;
        const compañeros = this.caminantesDeMesa(m.id);
        return !compañeros.some(comp => {
          const nombreComp = normaliza(`${comp.nombre} ${comp.apellidos}`);
          if (textoConoce && nombreComp.includes(textoConoce)) return true;
          const insComp = inscritos.find(x => x.contactoId === comp.id);
          const conoceComp = normaliza(insComp?.mesaConoceA || '');
          return conoceComp && normaliza(`${persona.nombre} ${persona.apellidos}`).includes(conoceComp);
        });
      });
      // Los de la misma zona van juntos (importante en retiros combinados entre zonas):
      // se prioriza una mesa vacía o ya con gente de su misma zona; solo se mezcla si no queda otra opción.
      const mismaZona = validas.filter(m => {
        const compañeros = this.caminantesDeMesa(m.id);
        return !compañeros.length || compañeros.every(comp => comp.zonaId === persona.zonaId);
      });
      const candidatas = mismaZona.length ? mismaZona : validas;

      let mejor = null, mejorPuntos = -Infinity;
      for (const m of candidatas) {
        const puntos = CAPACIDAD_CAMINANTES - ocupacionCount[m.id]; // preferir repartir equitativamente
        if (puntos > mejorPuntos) { mejorPuntos = puntos; mejor = m; }
      }
      if (mejor) { this.asignarCaminanteMesa(retiroId, persona.id, mejor.id); ocupacionCount[mejor.id]++; }
    }
  },

  /* ---------- Sugerencia automática de habitaciones ----------
     Heurística de mejor esfuerzo (no es una solución óptima): agrupa primero por peticiones
     explícitas de compañero, y luego rellena por cercanía de localidad, evitando edades muy
     parecidas y malas combinaciones de ronquidos. Solo toca a quien todavía no tenga habitación
     asignada — nunca mueve a alguien ya colocado a mano. */
  sugerirAsignacionHabitaciones(retiroId) {
    const edad = (fechaNacimiento) => {
      if (!fechaNacimiento) return null;
      const hoy = new Date(), n = new Date(fechaNacimiento);
      let a = hoy.getFullYear() - n.getFullYear();
      if (hoy.getMonth() < n.getMonth() || (hoy.getMonth() === n.getMonth() && hoy.getDate() < n.getDate())) a--;
      return a;
    };
    const severidadRonquido = (texto) => {
      const t = (texto || '').toLowerCase();
      if (t.includes('mucho')) return 2;
      if (t.includes('poco') || t.includes('a veces')) return 1;
      return 0;
    };
    const toleranciaRonquido = (texto) => {
      const t = (texto || '').toLowerCase();
      if (t.includes('no.') || t.startsWith('no')) return 0;
      if (t.includes('si no hace mucho') || t.includes('bueno')) return 1;
      return 2; // "Sí." u otra respuesta abierta = tolera bien
    };

    for (const papel of ['caminante', 'servidor']) {
      const inscritos = this.db.inscripciones.filter(i => i.retiroId === retiroId && i.papel === papel && !i.esAngelito);
      const personas = inscritos.map(i => this.contacto(i.contactoId)).filter(Boolean);
      const habitaciones = this.db.habitaciones.filter(h => h.retiroId === retiroId && h.papel === papel);
      if (!habitaciones.length) continue;

      const yaAsignado = (contactoId) => this.db.habitacionOcupantes.some(o => o.retiroId === retiroId && o.contactoId === contactoId);
      const ocupacion = Object.fromEntries(habitaciones.map(h => [h.id, this.ocupantesDe(h.id).length]));
      let pendientes = personas.filter(p => !yaAsignado(p.id));

      // 1) Peticiones explícitas de compañero: si A pide a B (por nombre) y ambos están libres, van juntos primero.
      const normaliza = s => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
      const parejas = [];
      pendientes.forEach(p => {
        if (!p.companeroPreferido) return;
        const buscado = normaliza(p.companeroPreferido);
        if (!buscado || buscado === 'indiferente') return;
        const pareja = pendientes.find(q => q.id !== p.id && normaliza(`${q.nombre} ${q.apellidos}`).includes(buscado));
        if (pareja && !parejas.some(pr => pr.includes(p.id) || pr.includes(pareja.id))) parejas.push([p.id, pareja.id]);
      });
      for (const [id1, id2] of parejas) {
        const h = habitaciones.find(x => x.capacidad - ocupacion[x.id] >= 2) || habitaciones.find(x => x.capacidad - ocupacion[x.id] >= 1);
        if (!h) continue;
        this.asignarOcupante(retiroId, id1, h.id); ocupacion[h.id]++;
        const h2 = habitaciones.find(x => x.id === h.id && x.capacidad - ocupacion[x.id] >= 1) || h;
        this.asignarOcupante(retiroId, id2, h2.id); ocupacion[h2.id]++;
      }
      pendientes = pendientes.filter(p => !parejas.flat().includes(p.id));

      // 2) Resto: por cercanía de localidad, evitando edades muy parecidas y malas combinaciones de ronquidos.
      const porLocalidad = {};
      pendientes.forEach(p => { (porLocalidad[normaliza(p.localidad) || '—'] ||= []).push(p); });
      const gruposOrdenados = Object.values(porLocalidad).sort((a, b) => b.length - a.length);

      for (const grupo of gruposOrdenados) {
        for (const persona of grupo) {
          let mejor = null, mejorPuntos = -Infinity;
          for (const h of habitaciones) {
            const libres = h.capacidad - ocupacion[h.id];
            if (libres <= 0) continue;
            const ocupantes = this.ocupantesDe(h.id);
            let puntos = libres === h.capacidad ? 0.5 : 0; // pequeño empujón a abrir habitaciones nuevas si hace falta
            puntos += h.capacidad === 2 ? 1.5 : h.capacidad === 3 ? -1 : 0; // las de 2 son lo habitual; las de 3, caso excepcional
            for (const o of ocupantes) {
              if (normaliza(o.localidad) === normaliza(persona.localidad) && persona.localidad) puntos += 3;
              const eo = edad(o.fechaNacimiento), ep = edad(persona.fechaNacimiento);
              if (eo != null && ep != null && Math.abs(eo - ep) < 5) puntos -= 2;
              const sO = severidadRonquido(o.ronca), sP = severidadRonquido(persona.ronca);
              const tO = toleranciaRonquido(o.duermeConRoncador), tP = toleranciaRonquido(persona.duermeConRoncador);
              if (sO >= 2 && tP <= 0) puntos -= 4;
              if (sP >= 2 && tO <= 0) puntos -= 4;
              if (sO <= 1 && sP <= 1) puntos += 1;
            }
            if (puntos > mejorPuntos) { mejorPuntos = puntos; mejor = h; }
          }
          if (mejor) { this.asignarOcupante(retiroId, persona.id, mejor.id); ocupacion[mejor.id]++; }
        }
      }
    }
  }
};

/* ---------- Plantillas: relleno de variables ---------- */
function fmtFecha(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  return `${d} de ${meses[m - 1]} de ${y}`;
}

function fmtFechaConDia(iso) {
  if (!iso) return '';
  const dias = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const d = new Date(iso + 'T12:00:00');
  return `${dias[d.getDay()]} ${fmtFecha(iso)}`;
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

function rellenarPlantillaActividad(texto, act) {
  const zona = Store.zona(act.zonaId);
  const equipo = Store.equipoDe(act.zonaId, new Date().getFullYear());
  const alias = equipo && equipo.alias ? equipo.alias : 'El equipo de Emaús';
  return texto
    .replaceAll('{titulo}', act.titulo || '')
    .replaceAll('{zona}', zona ? zona.nombre : '')
    .replaceAll('{fecha}', fmtFechaConDia(act.fecha))
    .replaceAll('{hora}', act.hora || '')
    .replaceAll('{lugar}', act.lugar || '')
    .replaceAll('{ubicacion}', act.enlaceUbicacion || '')
    .replaceAll('{programa}', act.programa || '')
    .replaceAll('{avisos}', act.avisos || '')
    .replaceAll('{alias}', alias);
}

function rellenarPlantilla(texto, retiro, contacto) {
  const zona = Store.zona(retiro.zonaId);
  const anio = new Date().getFullYear();
  const equipo = Store.equipoDe(retiro.zonaId, anio);
  const alias = equipo && equipo.alias ? equipo.alias : 'El equipo de Emaús';
  const enlace = `${Store.db.ajustes.enlaceBase}?retiro=${retiro.id}`;
  return texto
    .replaceAll('{retiro}', retiro.nombre)
    .replaceAll('{zona}', zona ? zona.nombre : '')
    .replaceAll('{fecha}', fmtRango(retiro.fechaInicio, retiro.fechaFin))
    .replaceAll('{lugar}', retiro.lugar || '')
    .replaceAll('{enlace}', enlace)
    .replaceAll('{alias}', alias)
    .replaceAll('{nombre}', contacto ? contacto.nombre : 'hermano/a de Emaús');
}
