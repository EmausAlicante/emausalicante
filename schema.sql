-- ============================================================
-- Emaús · Gestión de retiros — esquema para Supabase (fase nube)
-- ============================================================
-- Cómo usar este archivo:
--   1. Entra en tu proyecto de Supabase → menú "SQL Editor" → "New query".
--   2. Pega TODO el contenido de este archivo.
--   3. Pulsa "Run". Se puede volver a ejecutar sin problema (usa
--      "if not exists" / "on conflict do nothing" en todo lo posible).
--   4. Los líderes se dan de alta añadiéndolos en Ajustes → "Líderes
--      autorizados" dentro de la propia app (o insertando directamente
--      en la tabla "lideres"). Sin estar en esa lista, un email no puede
--      obtener sesión aunque pida el enlace mágico.
-- ============================================================

-- ---------- Zonas ----------
create table if not exists zonas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  tipo text not null check (tipo in ('provincia', 'localidad'))
);

-- ---------- Contactos ----------
create table if not exists contactos (
  id uuid primary key default gen_random_uuid(),
  zona_id uuid not null references zonas(id),
  nombre text not null default '',
  apellidos text not null default '',
  dni text default '',
  fecha_nacimiento date,
  email text default '',
  telefono text default '',
  fecha_retiro date,
  direccion text default '',
  cp text default '',
  localidad text default '',
  fecha_expedicion_dni date,
  servicios_previos int not null default 0,
  talla_polo text default '',
  ronca text default '',
  duerme_con_roncador text default '',
  companero_preferido text default '',
  contacto_emergencia_nombre text default '',
  contacto_emergencia_telefono text default '',
  contacto_emergencia_relacion text default '',
  parroquia_camino text default ''
);
alter table contactos add column if not exists talla_polo text default '';
alter table contactos add column if not exists ronca text default '';
alter table contactos add column if not exists duerme_con_roncador text default '';
alter table contactos add column if not exists companero_preferido text default '';
alter table contactos add column if not exists contacto_emergencia_nombre text default '';
alter table contactos add column if not exists contacto_emergencia_telefono text default '';
alter table contactos add column if not exists contacto_emergencia_relacion text default '';
alter table contactos add column if not exists parroquia_camino text default '';
create index if not exists idx_contactos_zona on contactos(zona_id);
create index if not exists idx_contactos_dni on contactos(upper(dni));
create index if not exists idx_contactos_email on contactos(lower(email));

-- ---------- Equipos de zona (líder + 2 colíderes, uno por zona y año) ----------
create table if not exists equipos (
  zona_id uuid not null references zonas(id),
  anio int not null,
  alias text default '',
  lider_contacto_id uuid references contactos(id) on delete set null,
  colider1_contacto_id uuid references contactos(id) on delete set null,
  colider2_contacto_id uuid references contactos(id) on delete set null,
  primary key (zona_id, anio)
);

-- ---------- Retiros ----------
create table if not exists retiros (
  id uuid primary key default gen_random_uuid(),
  zona_id uuid not null references zonas(id),
  nombre text not null,
  fecha_inicio date not null,
  fecha_fin date not null,
  lugar text default '',
  precio numeric,
  suplemento_individual numeric,
  info_extra text default '',
  creado date not null default current_date,
  cerrado boolean not null default false,
  acta jsonb  -- foto congelada de participantes/acciones al cerrar el retiro
);
create index if not exists idx_retiros_zona on retiros(zona_id);

-- ---------- Inscripciones ----------
create table if not exists inscripciones (
  id uuid primary key default gen_random_uuid(),
  retiro_id uuid not null references retiros(id) on delete cascade,
  contacto_id uuid not null references contactos(id) on delete cascade,
  papel text not null check (papel in ('servidor', 'caminante')),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'confirmada')),
  pagado boolean not null default false,
  metodo_pago text default '',
  notas text default '',
  detalles jsonb,  -- ficha larga del formulario de servidores
  unique (retiro_id, contacto_id)
);
create index if not exists idx_inscripciones_retiro on inscripciones(retiro_id);
create index if not exists idx_inscripciones_contacto on inscripciones(contacto_id);

-- ---------- Acciones del retiro ----------
create table if not exists acciones (
  id uuid primary key default gen_random_uuid(),
  retiro_id uuid not null references retiros(id) on delete cascade,
  titulo text not null,
  contacto_id uuid references contactos(id) on delete set null,
  fecha_limite date,
  hecha boolean not null default false
);
create index if not exists idx_acciones_retiro on acciones(retiro_id);

-- ---------- Documentos necesarios del retiro ----------
create table if not exists documentos (
  id uuid primary key default gen_random_uuid(),
  retiro_id uuid not null references retiros(id) on delete cascade,
  titulo text not null,
  enlace text default '',
  listo boolean not null default false,
  notas text default ''
);
create index if not exists idx_documentos_retiro on documentos(retiro_id);

-- ---------- Actividades del año (reuniones, adoraciones...) ----------
create table if not exists actividades (
  id uuid primary key default gen_random_uuid(),
  zona_id uuid not null references zonas(id),
  titulo text not null,
  fecha date not null,
  hora text default '',
  lugar text default '',
  enlace_ubicacion text default '',
  dias_antes int not null default 2,
  programa text default '',
  avisos text default ''
);
create index if not exists idx_actividades_zona on actividades(zona_id);

create table if not exists actividad_asistentes (
  actividad_id uuid not null references actividades(id) on delete cascade,
  contacto_id uuid not null references contactos(id) on delete cascade,
  primary key (actividad_id, contacto_id)
);

-- ---------- Cartas a los caminantes ----------
create table if not exists cartas (
  id uuid primary key default gen_random_uuid(),
  retiro_id uuid not null references retiros(id) on delete cascade,
  contacto_id uuid not null references contactos(id) on delete cascade,
  numero int not null,
  remitente text default '',
  fecha date not null default current_date,
  impresa boolean not null default false,
  notas text default ''
);
create index if not exists idx_cartas_retiro_contacto on cartas(retiro_id, contacto_id);

-- ---------- Inventario de ropa: catálogo fijo + stock + pedidos ----------
create table if not exists productos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  color text default ''
);
insert into productos (nombre, color) values
  ('Sudadera azul', 'Azul'),
  ('Chaqueta azul', 'Azul'),
  ('Polo blanco con Emaús', 'Blanco'),
  ('Polo azul con Emaús', 'Azul'),
  ('Polo blanco con la rosa', 'Blanco')
on conflict (nombre) do nothing;

create table if not exists stock (
  producto_id uuid not null references productos(id) on delete cascade,
  talla text not null check (talla in ('S', 'M', 'L', 'XL', '2XL', '3XL')),
  cantidad int not null default 0,
  primary key (producto_id, talla)
);

create table if not exists pedidos_prendas (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid not null references productos(id) on delete cascade,
  talla text not null,
  contacto_id uuid references contactos(id) on delete set null,
  retiro_id uuid references retiros(id) on delete set null,
  fecha date not null default current_date,
  atendido boolean not null default false
);

-- ---------- Configuración: organización, ajustes y plantillas (una sola fila cada una) ----------
create table if not exists organizacion (
  id int primary key default 1 check (id = 1),
  nombre text not null default 'Mi comunidad de Emaús',
  logo_url text
);
insert into organizacion (id, nombre) values (1, 'Mi comunidad de Emaús') on conflict (id) do nothing;

create table if not exists ajustes (
  id int primary key default 1 check (id = 1),
  enlace_base text not null default ''
);
insert into ajustes (id) values (1) on conflict (id) do nothing;

-- Lista blanca de líderes autorizados a entrar (ver trigger más abajo:
-- sin fila aquí con activo=true, un email no puede darse de alta como
-- usuario aunque pida el enlace mágico de login).
create table if not exists lideres (
  email text primary key,
  nombre text not null default '',
  activo boolean not null default true,
  rol text not null default 'coordinador' check (rol in ('coordinador','material','tesoreria','actividades')),
  creado_en timestamptz not null default now()
);
alter table lideres add column if not exists rol text not null default 'coordinador';
do $$ begin
  alter table lideres add constraint lideres_rol_check check (rol in ('coordinador','material','tesoreria','actividades'));
exception when duplicate_object then null;
end $$;
-- IMPORTANTE: sin al menos una fila aquí con activo=true, NADIE puede
-- iniciar sesión (ni siquiera para gestionar líderes desde la app, porque
-- eso ya exige estar logueado). Antes de que el primer líder intente
-- entrar, ejecuta a mano en el SQL Editor, cambiando el email y el nombre:
--
--   insert into lideres (email, nombre, rol) values ('tu-email@ejemplo.com', 'Tu nombre', 'coordinador');

-- ---------- Tesorería: categorías (ampliables) y movimientos ----------
create table if not exists categorias_tesoreria (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('ingreso', 'gasto')),
  nombre text not null,
  unique (tipo, nombre)
);
insert into categorias_tesoreria (tipo, nombre) values
  ('ingreso', 'Caminantes'), ('ingreso', 'Servidores'), ('ingreso', 'Venta de polos'),
  ('ingreso', 'Venta de vinos'), ('ingreso', 'Donaciones'), ('ingreso', 'Otros'),
  ('gasto', 'Hotel/alojamiento'), ('gasto', 'Packaging/material'), ('gasto', 'Fotos'),
  ('gasto', 'Comida/cátering'), ('gasto', 'Transporte'), ('gasto', 'Otros')
on conflict (tipo, nombre) do nothing;

create table if not exists movimientos_tesoreria (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('ingreso', 'gasto')),
  categoria_id uuid not null references categorias_tesoreria(id),
  retiro_id uuid references retiros(id) on delete set null,  -- opcional: suelto si es null
  concepto text default '',
  importe numeric not null check (importe > 0),
  fecha date not null default current_date,
  creado_por text default ''
);
create index if not exists idx_movimientos_retiro on movimientos_tesoreria(retiro_id);

create table if not exists plantillas (
  id int primary key default 1 check (id = 1),
  email_asunto text default '',
  email_cuerpo text default '',
  whatsapp text default '',
  email_actividad_asunto text default '',
  email_actividad_cuerpo text default ''
);
insert into plantillas (id, email_asunto, email_cuerpo, whatsapp, email_actividad_asunto, email_actividad_cuerpo)
values (
  1,
  'Convocatoria · {retiro} — {fecha}',
  $tpl$Hola {nombre}:

¡Ya tenemos fecha para el próximo {retiro} de {zona}! Será {fecha} en {lugar}.

Si ya viviste tu retiro y quieres venir a servir, apúntate en este enlace:
{enlace}

Y si conoces a alguien que todavía no ha vivido su Retiro de Emaús, reenvíale esta invitación para que se inscriba como caminante:
{enlace}

Un abrazo,
{alias} · Emaús {zona}$tpl$,
  $tpl$🙌 *¡Ya hay fecha para el próximo {retiro} de {zona}!*
📅 {fecha}
📍 {lugar}

Si ya viviste tu retiro y quieres venir a *servir*, o conoces a alguien que quiera vivirlo como *caminante*, apúntate aquí 👇
{enlace}

¡Compártelo! 🙏$tpl$,
  'CONVOCATORIA · {titulo} · {fecha} · Emaús {zona}',
  $tpl$Buenas tardes, hermanos:

Os remitimos este mensaje con la convocatoria de {titulo}, que tendremos D.m. este {fecha} a las {hora} horas en {lugar}.
{ubicacion}

PROGRAMA:
{programa}

{avisos}

"Gracias de antemano a todos y cada uno de vosotros, hermanos."

Un fuerte abrazo,
{alias} · Emaús {zona}

🌹 ¡JESUCRISTO HA RESUCITADO! ¡EN VERDAD HA RESUCITADO! 🌹$tpl$
) on conflict (id) do nothing;

-- ============================================================
-- Seguridad (RLS) basada en ROLES.
-- 'coordinador' = acceso total (como antes).
-- 'material', 'tesoreria', 'actividades' = solo su área, más una
-- lectura mínima de contactos/retiros donde hace falta ver nombres.
-- ============================================================

-- Devuelve el rol del líder autenticado actual (o null si no tiene sesión
-- de líder válida). security definer: puede leer "lideres" aunque el que
-- llama no tenga permiso de tabla sobre ella, porque solo expone SU PROPIO rol.
create or replace function mi_rol() returns text
language sql stable security definer
set search_path = public
as $$
  select rol from lideres where email = auth.email() and activo = true limit 1;
$$;
grant execute on function mi_rol() to authenticated;

do $$
declare t text;
begin
  for t in select unnest(array[
    'zonas','contactos','equipos','retiros','inscripciones','acciones',
    'documentos','actividades','actividad_asistentes','cartas',
    'productos','stock','pedidos_prendas','organizacion','ajustes','plantillas',
    'lideres','categorias_tesoreria','movimientos_tesoreria'
  ])
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "authenticated_all" on %I', t);
  end loop;
end $$;

-- Tablas de uso exclusivo del coordinador general
do $$
declare t text;
begin
  for t in select unnest(array[
    'zonas','equipos','acciones','documentos','cartas',
    'organizacion','ajustes','plantillas','lideres'
  ])
  loop
    execute format('drop policy if exists "coordinador_all" on %I', t);
    execute format('create policy "coordinador_all" on %I for all to authenticated using (mi_rol() = ''coordinador'') with check (mi_rol() = ''coordinador'')', t);
  end loop;
end $$;

-- Contactos: el coordinador puede todo; material/tesorería/actividades
-- solo necesitan LEER nombres, no editarlos.
drop policy if exists "coordinador_all" on contactos;
create policy "coordinador_all" on contactos for all to authenticated
  using (mi_rol() = 'coordinador') with check (mi_rol() = 'coordinador');
drop policy if exists "lectura_apoyo_contactos" on contactos;
create policy "lectura_apoyo_contactos" on contactos for select to authenticated
  using (mi_rol() in ('material','tesoreria','actividades'));

-- Retiros: el coordinador puede todo; tesorería y material solo leen
-- (nombre/fechas/precio) para tener contexto de su propia sección.
drop policy if exists "coordinador_all" on retiros;
create policy "coordinador_all" on retiros for all to authenticated
  using (mi_rol() = 'coordinador') with check (mi_rol() = 'coordinador');
drop policy if exists "lectura_apoyo_retiros" on retiros;
create policy "lectura_apoyo_retiros" on retiros for select to authenticated
  using (mi_rol() in ('tesoreria','material'));

-- Inscripciones: tesorería gestiona pagos igual que el coordinador.
drop policy if exists "coordinador_tesoreria_inscripciones" on inscripciones;
create policy "coordinador_tesoreria_inscripciones" on inscripciones for all to authenticated
  using (mi_rol() in ('coordinador','tesoreria')) with check (mi_rol() in ('coordinador','tesoreria'));

-- Tesorería: categorías y movimientos (ingresos/gastos), solo coordinador y tesorería
do $$
declare t text;
begin
  for t in select unnest(array['categorias_tesoreria','movimientos_tesoreria'])
  loop
    execute format('drop policy if exists "coordinador_tesoreria" on %I', t);
    execute format('create policy "coordinador_tesoreria" on %I for all to authenticated using (mi_rol() in (''coordinador'',''tesoreria'')) with check (mi_rol() in (''coordinador'',''tesoreria''))', t);
  end loop;
end $$;

-- Material (prendas): coordinador y encargado de material
do $$
declare t text;
begin
  for t in select unnest(array['productos','stock','pedidos_prendas'])
  loop
    execute format('drop policy if exists "coordinador_material" on %I', t);
    execute format('create policy "coordinador_material" on %I for all to authenticated using (mi_rol() in (''coordinador'',''material'')) with check (mi_rol() in (''coordinador'',''material''))', t);
  end loop;
end $$;

-- Actividades: coordinador y encargado de actividades
do $$
declare t text;
begin
  for t in select unnest(array['actividades','actividad_asistentes'])
  loop
    execute format('drop policy if exists "coordinador_actividades" on %I', t);
    execute format('create policy "coordinador_actividades" on %I for all to authenticated using (mi_rol() in (''coordinador'',''actividades'')) with check (mi_rol() in (''coordinador'',''actividades''))', t);
  end loop;
end $$;

drop policy if exists "anon_select_retiros" on retiros;
create policy "anon_select_retiros" on retiros for select to anon using (true);

drop policy if exists "anon_select_zonas" on zonas;
create policy "anon_select_zonas" on zonas for select to anon using (true);

-- El catálogo de prendas (nombre/color) es público para que el formulario pueda mostrarlo;
-- el stock real y los pedidos siguen siendo privados (solo líderes).
drop policy if exists "anon_select_productos" on productos;
create policy "anon_select_productos" on productos for select to anon using (true);

-- ============================================================
-- Lista blanca de líderes: bloquea el alta de cualquier usuario de
-- auth.users cuyo email no esté en "lideres" con activo=true. Es la
-- barrera real (a nivel de base de datos, no del botón de login),
-- porque la clave "anon" es pública y cualquiera podría llamar a la
-- API de Auth directamente. Los líderes ya existentes no se ven
-- afectados (el trigger solo mira altas nuevas, no inicios de sesión
-- de quien ya tiene cuenta).
-- ============================================================
create or replace function verificar_lider_autorizado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from lideres where lower(email) = lower(new.email) and activo
  ) then
    raise exception 'Este email no está autorizado como líder de Emaús.';
  end if;
  return new;
end;
$$;

drop trigger if exists trigger_verificar_lider on auth.users;
create trigger trigger_verificar_lider
  before insert on auth.users
  for each row execute function verificar_lider_autorizado();

-- ============================================================
-- Logotipo: bucket público de Storage
-- ============================================================
insert into storage.buckets (id, name, public)
values ('logos', 'logos', true)
on conflict (id) do nothing;

drop policy if exists "logos_lectura_publica" on storage.objects;
create policy "logos_lectura_publica" on storage.objects for select to public using (bucket_id = 'logos');

drop policy if exists "logos_escritura_lideres" on storage.objects;
create policy "logos_escritura_lideres" on storage.objects for insert to authenticated with check (bucket_id = 'logos');

drop policy if exists "logos_actualizacion_lideres" on storage.objects;
create policy "logos_actualizacion_lideres" on storage.objects for update to authenticated using (bucket_id = 'logos');

drop policy if exists "logos_borrado_lideres" on storage.objects;
create policy "logos_borrado_lideres" on storage.objects for delete to authenticated using (bucket_id = 'logos');

-- ============================================================
-- Funciones RPC públicas de inscripción (formulario.html las llama
-- con la clave "anon" — nunca escriben en las tablas directamente).
-- Replican la lógica de buscarOCrearContacto/Store.inscribir del
-- store.js/app.js actual: buscar contacto por DNI o email, crear o
-- actualizar, convertir a servidor si toca, e inscribir en el retiro.
-- ============================================================

create or replace function inscribir_caminante(
  p_retiro_id uuid,
  p_nombre text,
  p_apellidos text,
  p_telefono text,
  p_email text default '',
  p_dni text default '',
  p_fecha_nacimiento date default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_retiro retiros%rowtype;
  v_contacto contactos%rowtype;
  v_dni text := upper(trim(coalesce(p_dni, '')));
  v_email text := lower(trim(coalesce(p_email, '')));
  v_hoy date := current_date;
begin
  select * into v_retiro from retiros where id = p_retiro_id;
  if not found then raise exception 'El retiro no existe.'; end if;
  if v_hoy < v_retiro.creado or v_hoy > v_retiro.fecha_fin then
    raise exception 'La inscripción para este retiro no está abierta.';
  end if;
  if coalesce(trim(p_nombre), '') = '' or coalesce(trim(p_apellidos), '') = '' or coalesce(trim(p_telefono), '') = '' then
    raise exception 'Nombre, apellidos y teléfono son obligatorios.';
  end if;

  select * into v_contacto from contactos
    where (v_dni <> '' and upper(dni) = v_dni) or (v_email <> '' and lower(email) = v_email)
    limit 1;

  if found then
    update contactos set
      nombre = p_nombre, apellidos = p_apellidos,
      telefono = coalesce(nullif(p_telefono, ''), telefono),
      email = coalesce(nullif(v_email, ''), email),
      dni = coalesce(nullif(v_dni, ''), dni),
      fecha_nacimiento = coalesce(p_fecha_nacimiento, fecha_nacimiento)
    where id = v_contacto.id
    returning * into v_contacto;
  else
    insert into contactos (zona_id, nombre, apellidos, dni, fecha_nacimiento, email, telefono)
    values (v_retiro.zona_id, p_nombre, p_apellidos, v_dni, p_fecha_nacimiento, v_email, p_telefono)
    returning * into v_contacto;
  end if;

  insert into inscripciones (retiro_id, contacto_id, papel, estado, detalles)
  values (p_retiro_id, v_contacto.id, 'caminante', 'pendiente', jsonb_build_object('fechaInscripcion', v_hoy))
  on conflict (retiro_id, contacto_id) do update set papel = 'caminante';

  return jsonb_build_object('contacto_id', v_contacto.id, 'nombre', v_contacto.nombre, 'apellidos', v_contacto.apellidos);
end;
$$;

create or replace function inscribir_servidor(
  p_retiro_id uuid,
  p_nombre text,
  p_apellidos text,
  p_telefono text,
  p_email text,
  p_dni text,
  p_fecha_nacimiento date default null,
  p_direccion text default '',
  p_cp text default '',
  p_localidad text default '',
  p_camino_origen text default '',
  p_primera_vez text default '',
  p_donde_sirvio text default '',
  p_ronca text default '',
  p_habitacion_individual text default '',
  p_dormir_con_roncador text default '',
  p_companero_habitacion text default '',
  p_emergencia_nombre text default '',
  p_emergencia_telefono text default '',
  p_emergencia_relacion text default '',
  p_dni_expedicion date default null,
  p_privacidad_aceptada boolean default false,
  p_pedido_equipacion jsonb default '[]'::jsonb  -- [{"producto_id": "...", "talla": "M"}, ...]
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_retiro retiros%rowtype;
  v_contacto contactos%rowtype;
  v_dni text := upper(trim(coalesce(p_dni, '')));
  v_email text := lower(trim(coalesce(p_email, '')));
  v_hoy date := current_date;
  v_anio text;
  v_fecha_retiro date;
  v_item jsonb;
  v_stock int;
  v_resultado jsonb := '[]'::jsonb;
  v_estado text;
begin
  select * into v_retiro from retiros where id = p_retiro_id;
  if not found then raise exception 'El retiro no existe.'; end if;
  if v_hoy < v_retiro.creado or v_hoy > v_retiro.fecha_fin then
    raise exception 'La inscripción para este retiro no está abierta.';
  end if;
  if coalesce(trim(p_nombre), '') = '' or coalesce(trim(p_apellidos), '') = '' or coalesce(trim(p_telefono), '') = ''
     or coalesce(trim(p_email), '') = '' or coalesce(trim(p_dni), '') = '' then
    raise exception 'Faltan datos obligatorios: nombre, apellidos, teléfono, email y DNI.';
  end if;
  if not coalesce(p_privacidad_aceptada, false) then
    raise exception 'Es necesario aceptar la política de privacidad.';
  end if;
  v_anio := substring(p_camino_origen from '(19|20)\d{2}');
  if v_anio is null then
    raise exception 'Indica al menos el año en que viviste tu retiro (ej. 2022 · Parroquia San Juan).';
  end if;
  v_fecha_retiro := (v_anio || '-01-01')::date;

  select * into v_contacto from contactos
    where (v_dni <> '' and upper(dni) = v_dni) or (v_email <> '' and lower(email) = v_email)
    limit 1;

  if found then
    update contactos set
      nombre = p_nombre, apellidos = p_apellidos,
      telefono = coalesce(nullif(p_telefono, ''), telefono),
      email = coalesce(nullif(v_email, ''), email),
      dni = coalesce(nullif(v_dni, ''), dni),
      fecha_nacimiento = coalesce(p_fecha_nacimiento, fecha_nacimiento),
      direccion = coalesce(nullif(p_direccion, ''), direccion),
      cp = coalesce(nullif(p_cp, ''), cp),
      localidad = coalesce(nullif(p_localidad, ''), localidad),
      fecha_expedicion_dni = coalesce(p_dni_expedicion, fecha_expedicion_dni),
      fecha_retiro = coalesce(fecha_retiro, v_fecha_retiro)
    where id = v_contacto.id
    returning * into v_contacto;
  else
    insert into contactos (zona_id, nombre, apellidos, dni, fecha_nacimiento, email, telefono,
      direccion, cp, localidad, fecha_expedicion_dni, fecha_retiro)
    values (v_retiro.zona_id, p_nombre, p_apellidos, v_dni, p_fecha_nacimiento, v_email, p_telefono,
      p_direccion, p_cp, p_localidad, p_dni_expedicion, v_fecha_retiro)
    returning * into v_contacto;
  end if;

  -- Cada prenda pedida: si hay stock se reserva (se descuenta); si no, va a la lista de pedidos pendientes
  for v_item in select * from jsonb_array_elements(coalesce(p_pedido_equipacion, '[]'::jsonb))
  loop
    select cantidad into v_stock from stock
      where producto_id = (v_item->>'producto_id')::uuid and talla = (v_item->>'talla')
      for update;
    if v_stock is not null and v_stock > 0 then
      update stock set cantidad = cantidad - 1
        where producto_id = (v_item->>'producto_id')::uuid and talla = (v_item->>'talla');
      v_estado := 'stock';
    else
      insert into pedidos_prendas (producto_id, talla, contacto_id, retiro_id, fecha, atendido)
      values ((v_item->>'producto_id')::uuid, v_item->>'talla', v_contacto.id, p_retiro_id, v_hoy, false);
      v_estado := 'pedido';
    end if;
    v_resultado := v_resultado || jsonb_build_object(
      'producto', (select nombre from productos where id = (v_item->>'producto_id')::uuid),
      'talla', v_item->>'talla', 'estado', v_estado);
  end loop;

  insert into inscripciones (retiro_id, contacto_id, papel, estado, detalles)
  values (p_retiro_id, v_contacto.id, 'servidor', 'pendiente', jsonb_build_object(
    'caminoOrigen', p_camino_origen, 'primeraVez', p_primera_vez, 'dondeSirvio', p_donde_sirvio,
    'pedidoEquipacion', v_resultado, 'ronca', p_ronca,
    'habitacionIndividual', p_habitacion_individual, 'dormirConRoncador', p_dormir_con_roncador,
    'companeroHabitacion', p_companero_habitacion, 'emergenciaNombre', p_emergencia_nombre,
    'emergenciaTelefono', p_emergencia_telefono, 'emergenciaRelacion', p_emergencia_relacion,
    'privacidadAceptada', true, 'fechaInscripcion', v_hoy
  ))
  on conflict (retiro_id, contacto_id) do update set papel = 'servidor', detalles = excluded.detalles;

  return jsonb_build_object('contacto_id', v_contacto.id, 'nombre', v_contacto.nombre,
    'apellidos', v_contacto.apellidos, 'pedido_equipacion', v_resultado);
end;
$$;

grant execute on function inscribir_caminante to anon, authenticated;
grant execute on function inscribir_servidor to anon, authenticated;

-- ============================================================
-- Fin. Si todo se ha ejecutado sin errores, el proyecto ya tiene
-- el modelo de datos completo listo para conectar la app.
-- ============================================================
