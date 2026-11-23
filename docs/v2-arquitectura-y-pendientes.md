# Torquex V2: acceso e identidad

## Dos ediciones independientes

1. **Demo comercial en Netlify:** conserva datos ficticios y permite recorrer las funciones para presentar Torquex. Sus datos no son reales ni se copian al sistema de un cliente.
2. **Entrega vacía de Torquex:** inicia sin productos, ventas, importaciones, gastos ni cuentas de demostración. Usa una base de datos, dominio y usuarios propios. El administrador invita al personal; el registro público se mantiene deshabilitado.

Para cada implementación dedicada a un negocio, se preparará un proyecto de base de datos separado y variables de sitio propias. No se reutilizarán claves ni bases de datos entre la demo y los clientes. La primera entrega vacía corresponde al negocio Torquex. El alta de datos demo queda fuera de su paquete de instalación.

El módulo SRI estará presente en ambas ediciones solo como elemento bloqueado “Próximamente”, sin acciones operativas.

## Objetivo de seguridad

Torquex V2 usará Supabase Auth y PostgreSQL para que varias personas de la misma empresa trabajen sobre información compartida. No habrá registro público. Una persona administradora invitará a cada integrante por correo y asignará su rol.

El enlace de alta se generará con 256 bits aleatorios, tendrá vigencia de 24 horas y se guardará en la base de datos solo como hash SHA-256. Se entrega al administrador una sola vez y se consume con una actualización atómica; un segundo intento o un enlace vencido se rechaza. Al emitir uno nuevo para el mismo correo, se cancela cualquier invitación anterior todavía abierta. El token viaja en el fragmento del navegador (`#invite=...`), que no se envía en la petición HTTP al sitio. La creación de cuentas y el uso de la clave de servicio ocurren únicamente en funciones de Supabase.

Roles preparados: `admin`, `inventario`, `ventas` y `consulta`. La tabla `profiles` conserva el nombre y rol de cada persona. Las tablas de ventas, importaciones, gastos, cobros, devoluciones, reembolsos y movimientos ya cuentan con `created_by`; la migración V2 agrega la atribución de creación de productos. El registro de auditoría es de solo anexado.

## Archivos preparados

- `supabase/migrations/202611210001_initial.sql`: esquema funcional inicial y lectura limitada a miembros activos.
- `supabase/migrations/202611230001_v2_identity_invites.sql`: invitaciones de un solo uso, perfiles visibles entre miembros activos y protección de auditoría.
- `supabase/functions/create-invitation`: creación de invitación solo por administradores activos.
- `supabase/functions/accept-invitation`: alta de una cuenta desde invitación válida y consumo de un solo uso.
- `supabase/config.toml`: funciones de alta con verificación JWT desactivada solo para aceptación; el token aleatorio es la credencial de alta.

## Estado comprobado el 23 de noviembre de 2026

El `.env` apunta al proyecto Supabase Torquex y la clave pública pudo consultar el endpoint de Auth (HTTP 200). El proyecto está activo. La API respondió que aún no existen las tablas `profiles`, `products` ni `invitations` (HTTP 404), así que las migraciones no se han aplicado. El código de la app tampoco importa el cliente Supabase todavía.

## Todavía no está listo para datos reales

El esquema y las funciones están preparados en el código, pero aún no existe una conexión a un proyecto Supabase ni se han aplicado las migraciones. La aplicación V1.5 todavía lee y escribe en `localStorage`; por tanto, las cuentas creadas no deben usarse para trabajo real hasta completar la migración de datos, operaciones transaccionales de inventario/ventas y todas las políticas de acceso. No se debe publicar la V2 como sistema de producción en este estado. La edición vacía entregable tampoco está lista para entregar todavía.

Antes de habilitar el uso real quedan pendientes:

1. Crear el proyecto Supabase y configurar el dominio definitivo en `APP_ORIGIN`.
2. Aplicar las dos migraciones en orden y configurar Auth para cerrar el alta pública, recuperar cuentas y limitar sesiones.
3. Crear el primer perfil administrador de forma controlada después de verificar el correo real de Joel.
4. Desplegar las funciones Edge con `SUPABASE_SERVICE_ROLE_KEY` guardada como secreto, nunca en Netlify ni en el código del navegador.
5. Conectar el inicio de sesión, aceptación de invitaciones, cierre de sesión y administración de integrantes en la interfaz.
6. Sustituir `localStorage` por operaciones de base de datos con transacciones para ventas, cobros, devoluciones, reembolsos, importaciones, gastos, inventario y correcciones.
7. Aplicar roles en el servidor; registrar `auth.uid()` como autor de cada movimiento; consultar el nombre del autor en ventas e importaciones.
8. Migrar los datos ficticios solo después de revisarlos y confirmar si deben conservarse. No copiar datos del navegador automáticamente.
9. Probar carreras de stock, enlaces vencidos/reutilizados, acceso entre usuarios, recuperación de cuenta, respaldo y restauración.
10. Crear una configuración de publicación separada para la demo y para cada entrega, verificando que no compartan variables, servicios o archivos locales.

El módulo SRI permanece visible y bloqueado como “Próximamente”; no acepta datos ni emite comprobantes. La interfaz V1 puede seguir usándose como demostración local separada hasta que se complete la conexión y validación de V2.

## Configuración local

`/.env.example` contiene solo nombres de variables y una clave pública de ejemplo. La clave `service_role` nunca debe añadirse a un archivo Vite ni a las variables del sitio Netlify. Para crear la primera cuenta, primero se crea el usuario en Auth y después se añade su fila `profiles` con rol `admin` desde el SQL Editor, usando el UUID del usuario y después de verificar su email. El email inicial debe confirmarse con Joel: el valor guardado actualmente como email Git de commits no tiene formato de correo válido.
