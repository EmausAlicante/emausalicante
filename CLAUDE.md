# Emaús · Gestión de retiros

App de gestión de retiros para Emaús Alicante, pensada para que cualquier comunidad de Emaús pueda desplegar su propia copia. Vanilla JS sin build step (sin npm/bundler): abrir `index.html` basta. Todo el texto de la interfaz y los comentarios están en español, como el resto del proyecto.

## Estado y despliegue

- **Producción**: pendiente de primer despliegue en Vercel.
- **Repositorio**: https://github.com/EmausAlicante/emuausalicante (rama `main`). Vercel desplegará automáticamente en cada push una vez conectado.
- **Base de datos**: Supabase, proyecto `https://zxdrohchxdqaxvstpcpc.supabase.co` (proyecto nuevo, independiente del original de emaus-app). Credenciales públicas (clave *publishable*, no secreta) en `config.js`, que sí está commiteado.
- **Login de líderes**: enlace mágico por email (sin contraseña) vía Supabase Auth. Pendiente configurar SMTP propio si no se quiere depender del límite de emails por defecto de Supabase (Supabase → Authentication → Emails). Primer líder dado de alta manualmente vía SQL Editor (ver `schema.sql`).
- **Acceso restringido a líderes autorizados**: tabla `lideres` (email, nombre, activo, rol) + trigger `trigger_verificar_lider` sobre `auth.users` (en `schema.sql`) que bloquea cualquier alta cuyo email no esté en `lideres` con `activo=true`. Es la barrera real, a nivel de base de datos — no basta con ocultar el botón de login, porque la clave `anon` es pública. Los líderes existentes no se ven afectados (el trigger solo mira altas nuevas). Se gestiona desde la propia app: Ajustes → "Líderes autorizados" (añadir/desactivar/eliminar/cambiar rol), sin necesidad de tocar el panel de Supabase.
- **Roles** (columna `rol` en `lideres`, función `mi_rol()` + políticas RLS por rol en `schema.sql`): `coordinador` (acceso total, como antes), `material` (solo productos/stock/pedidos_prendas), `tesoreria` (ledger de ingresos/gastos + pagos de inscripciones, con lectura de retiros/contactos para tener contexto), `actividades` (solo actividades/asistentes, con lectura de contactos). La seguridad real está en las políticas RLS de Supabase (`mi_rol() in (...)` en cada tabla), no solo en ocultar el menú — el menú lateral (`App.vistasPorRol()` en `app.js`) es solo comodidad de interfaz.
- **Tesorería** (`categorias_tesoreria`, `movimientos_tesoreria`): ledger manual de ingresos/gastos por partida (categorías ampliables, no cerradas). Cada movimiento puede ligarse opcionalmente a un retiro (`retiro_id` nullable) o quedar suelto (donaciones, gastos generales). Es independiente del `pagado`/`metodoPago` de cada inscripción individual (eso sigue existiendo, para saber quién ha pagado su plaza; el ledger es para el saldo/caja general de la asociación).
- La base de datos de producción está **vacía** (sin zonas/contactos/retiros reales todavía) — solo tiene el catálogo fijo de 5 prendas y la config por defecto.

## Arquitectura

Tres páginas HTML independientes, sin router:

- `index.html` + `store.js` + `app.js` — la app de gestión, exige sesión (login por enlace mágico). Vistas: Panel, Contactos, Equipo de zona, Retiros (con Documentos y Cartas dentro del detalle), Actividades, Material (inventario de ropa), Tesorería, Formulario público (solo genera/copia el enlace, no es funcional aquí), Ajustes.
- **Importador de servidores desde Excel** (botón "Importar servidores (Excel)" en Contactos, usa SheetJS cargado por CDN en `app.html`): lee el típico export de un formulario de Google con datos de servidores (talla de polo, ronquidos, contacto de emergencia, año/parroquia de su propio camino de Emaús...) y los mapea a los campos de `contactos` (que incluyen esos campos extra desde entonces). Empareja por DNI o email para no duplicar altas repetidas. Los encabezados del Excel son largos y variables, así que se buscan por coincidencia parcial de texto (`App.importarServidoresExcel` en `app.js`), no por posición de columna.
- `formulario.html` + `formulario.js` — formulario público de inscripción, **sin login**, habla directo con Supabase (clave anon). Recibe `?retiro=ID&tipo=servidor|caminante` por URL; sin `tipo` muestra un selector. Envía la inscripción llamando a las funciones RPC `inscribir_servidor` / `inscribir_caminante` (nunca escribe en las tablas directamente).
- `supabase/schema.sql` — todo el modelo de datos: tablas, políticas RLS, las dos funciones RPC, bucket de Storage para el logo. **Es idempotente** (usa `if not exists` / `drop policy if exists` en todo), así que volver a pegarlo y ejecutarlo en el SQL Editor de Supabase es seguro si hace falta.

### El patrón clave de `store.js`: caché local optimista + persistencia en segundo plano

`Store.db` es un objeto en memoria con exactamente la misma forma que tenía la primera versión (que usaba `localStorage`): `{ organizacion, ajustes, zonas, contactos, equipos, retiros, inscripciones, acciones, documentos, actividades, cartas, inventario: {productos, stock, pedidos}, plantillas }`.

Cada método de mutación (`guardarContacto`, `guardarRetiro`, `inscribir`, etc.) sigue el mismo patrón:
1. Muta `Store.db` **de forma síncrona** (igual que antes), para que la interfaz responda al instante.
2. Dispara en segundo plano (sin `await` desde `app.js`) una llamada a Supabase que persiste *solo ese registro* — nunca se reescribe la base entera.

Esto significa que **`app.js` casi no sabe que existe la nube**: sigue leyendo `Store.db` y llamando a los mismos métodos que en la versión local. Los únicos sitios que sí son conscientes de la nube en `app.js` son el arranque (`App.init()`, que espera la sesión y la carga inicial async) y la pantalla de login.

Un canal de **Supabase Realtime** (`Store.suscribirRealtime()`) fusiona en `Store.db` los cambios que hagan otros líderes en vivo, para que dos personas editando a la vez se vean actualizadas sin recargar. Cubre: contactos, retiros, inscripciones, acciones, equipos, documentos, cartas. No cubre (de momento, bajo perceived-low-value): actividades, inventario, plantillas/ajustes/organización.

Los IDs se generan en el cliente con `crypto.randomUUID()` (no con el `Math.random()` de la versión local original), porque las tablas de Postgres usan `uuid` como clave primaria.

### RLS y seguridad

- `authenticated` (líder con sesión): acceso completo de lectura/escritura a todo. Un único nivel de confianza — no hay permisos por zona ni roles todavía (decisión consciente para no complicar el modelo en esta fase).
- `anon` (público, sin login): solo `SELECT` en `retiros`, `zonas` y `productos` (el catálogo de prendas necesita ser público para que el formulario lo muestre; el stock y los pedidos NO lo son). Más las dos funciones RPC, que son `SECURITY DEFINER` y hacen ellas mismas toda la validación (ventana de inscripción abierta, campos obligatorios, etc.).

### Cosas que se quitaron a propósito al migrar de local a nube

- `datosEjemplo()` / `restablecerEjemplo()` / `vaciar()` — no tiene sentido un botón de "resetear a datos de ejemplo" contra una base de datos compartida real. Si se necesitan datos de prueba, se insertan a mano vía SQL o desde la propia app.
- El formulario público *funcional* dentro de `app.js` (antes existía una pestaña que simulaba el envío escribiendo en `Store.db` local). Ahora esa pestaña solo genera y copia el enlace real a `formulario.html`.

## Convenciones del proyecto (heredadas de toda la conversación de diseño)

- Comentarios y nombres de variables en español, mínimos (solo cuando el porqué no es obvio).
- Un contacto es "servidor" si tiene `fechaRetiro` (pasada); si no, es "caminante" — es una propiedad derivada, nunca un campo editable directo de tipo.
- Un servidor no puede repetir como líder (`Store.haSidoLider`), pero sí como colíder, sin límite de años.
- El alias ("Peregrinos", "Discípulos"...) es del **equipo**, no de cada persona.
- Las acciones de un retiro solo se pueden asignar a servidores inscritos en *ese* retiro + el equipo vigente de la zona (`Store.responsablesDeRetiro`).
- Al cerrar un retiro se genera un **acta** (`retiro.acta`, JSONB): foto congelada de participantes y acciones que ya no cambia aunque se editen/borren esos contactos después.
- Pendiente / fase 2, explícitamente pospuesto: envío automático y programado de emails de convocatoria (hoy se copia/pega el asunto+cuerpo generados).

## Cómo seguir trabajando desde otro ordenador

1. Instala Claude Code si no lo tienes.
2. Consigue esta carpeta ahí: o bien `git clone https://github.com/EmausAlicante/emaus-app.git`, o bien abre la misma carpeta si ese ordenador también sincroniza el mismo OneDrive (`Documentos/Andrés/Emaus`).
3. Abre Claude Code en esa carpeta. Este archivo se carga solo — no hace falta reexplicar el proyecto.
4. Para probarlo en local: `npx --yes http-server . -p 4173 -c-1` desde la carpeta y abrir `http://localhost:4173`. Funciona igual que en producción porque `config.js` ya apunta a la base de datos real (no hay entorno de "desarrollo" separado todavía).
