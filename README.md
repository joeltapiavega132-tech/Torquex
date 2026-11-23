# Torquex

Sistema web de inventario, ventas, cobros, devoluciones, importaciones, gastos y reportes para la importadora de repuestos Torquex. La rama `v2.2` abre únicamente la edición con usuarios y datos compartidos. El módulo SRI permanece visible y deshabilitado.

## Ejecutar en la PC

1. Instalar dependencias con `npm ci`.
2. Crear `.env` a partir de `.env.example` y configurar `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`. Usar solo la clave pública; nunca añadir la clave de servicio al navegador.
3. Ejecutar `npm run dev -- --host localhost --port 5173 --strictPort` y abrir `http://localhost:5173`.
4. Iniciar sesión con una cuenta autorizada. El administrador puede invitar a otras personas desde «Equipo y cuenta».

La aplicación usa el proyecto Supabase configurado en `.env`. Cualquier registro guardado desde localhost queda en esa base compartida.

## Trabajo diario

- **Inventario:** registrar productos, compatibilidades, costo, precio y stock mínimo opcional; usar entradas y ajustes para modificar existencias.
- **Ventas y cobros:** registrar varias piezas, IVA por venta, cobros, devoluciones y reembolsos. La venta conserva los precios y costos con los que se registró.
- **Importaciones y gastos:** abrir cada ficha para ver el detalle y efectuar correcciones con motivo.
- **Reportes:** consultar períodos, rentabilidad, cuentas pendientes y exportar CSV o Excel.
- **Equipo y cuenta:** administrar invitaciones, roles y accesos; descargar un respaldo JSON desde la cuenta administradora.

## Publicación y verificación

El sitio privado debe publicar esta rama con `npm run build` y directorio `dist`. Configurar las dos variables públicas de Supabase en Netlify. Antes de entregar, cambiar en Supabase el Site URL, las redirecciones de Auth y `APP_ORIGIN` del origen local al dominio HTTPS del sitio; probar invitación, recuperación y acceso de cada rol. La [lista de entrega](docs/V2.2-estado-y-despliegue.md) contiene las comprobaciones pendientes. No usar registros de negocio hasta completarlas.
