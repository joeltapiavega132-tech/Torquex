# Torquex 1.5 · prueba limpia previa a la base de datos

Sistema de prueba para una importadora de repuestos, construido con React, TypeScript, Vite y Tailwind. **Sigue siendo un prototipo local:** guarda la información en el navegador y no debe contener operaciones reales.

## Ejecutar y comprobar

```powershell
npm ci
npm test
npm run build
npm run dev
```

La dirección local aparece en la terminal de Vite, normalmente `http://localhost:5173`.

## Preparado para Netlify y GitHub

La configuración `netlify.toml` compila el sitio con `npm run build` y publica `dist`. El archivo `public/_redirects` mantiene funcionando la app al abrir o actualizar sus páginas. El repositorio ignora dependencias, compilados, secretos y respaldos locales.

Para subirlo desde GitHub, carga el contenido de esta carpeta, incluida la carpeta `public`, `netlify.toml` y `package-lock.json`. En Netlify, usa **Add new site > Import an existing project**, conecta `joeltapiavega132-tech/Torquex` y verifica estos ajustes: comando `npm run build`, directorio de publicación `dist`, sin variables de entorno. Después despliega desde el panel de Netlify. No es necesario crear funciones serverless.

La versión desplegada arranca vacía. Los datos ficticios que se ingresen se guardan en el navegador y dispositivo usados para la demostración; no se sincronizan entre visitantes.

## Flujos listos para probar

- Catálogo con código secuencial, categoría, marca, modelo, vehículo, tipo de pieza, varias compatibilidades y stock mínimo opcional.
- Entradas de mercadería, ajustes con motivo y confirmación, historial de movimientos de stock.
- Ventas de varias piezas con IVA separado y precio/costo conservados por pieza. Cobros parciales.
- Devoluciones parciales, anulación con restauración de stock y reembolsos independientes. Las ventas originales no se borran. Un exceso cobrado queda señalado como importe por reembolsar.
- Gastos e importaciones con una ficha de detalle al pulsar **Ver detalle**.
- Gastos y entradas corregibles o anulables con motivo, confirmación e historial de revisiones. Las entradas ajustan la diferencia de stock y bloquean saldos negativos.
- Compatibilidades estructuradas por marca, modelo, motor y años; los campos anteriores siguen disponibles para datos heredados.
- Conteo guiado de inventario con diferencias registradas como movimientos.
- Reportes por período de ventas, devoluciones, utilidad, gastos y cobros netos. Rentabilidad por producto calculada con valores históricos.
- Período personalizado, antigüedad por cobrar desde la fecha de venta y valoración aproximada del stock al costo actual.
- Importación de catálogo CSV o Excel `.xlsx` con validación, detección de duplicados y vista previa. Exportación de inventario y ventas en ambos formatos.
- Exportación CSV y Excel de gastos y entradas, incluyendo su estado actual.
- Respaldo local JSON con exportación, vista previa y restauración confirmada.
- Módulo SRI visible como **Próximamente**, sin funciones operativas.

## Inicio limpio y conservación de datos

Al abrir la versión 1.5 por primera vez, se reemplazan una sola vez los registros locales anteriores por un estado vacío en ese navegador. No se carga la demo automáticamente y se quitó el botón para restaurarla. Después de ese primer inicio, los nuevos datos ficticios de la prueba sí se conservan hasta que se use **Configuración > Borrar datos locales**. La limpieza se aplica por navegador al abrir o actualizar la app; no puede vaciar un navegador que nunca vuelva a abrirse.

El recorrido con datos ficticios y resultados esperados está en `docs/manual-prueba-torquex.html`. Antes de restaurar, borrar datos o cambiar de equipo después de la prueba, descarga un respaldo desde **Configuración** si deseas conservarlos.

Desde 1.4.1, el IVA se redondea al centavo por línea usando enteros para evitar errores de coma flotante. La exportación de ventas muestra el total, cobro y saldo de cada venta solo en su primera fila, para no duplicarlos al sumar varias piezas. Consulta `docs/auditoria-calculos-2026-11-21.md` para el alcance y las limitaciones de la revisión.

## Pendiente y dependiente del servidor

La migración preparada en `supabase/migrations/202611210001_initial.sql` **no está aplicada ni conectada**. Falta implementar transacciones de servidor, autenticación, permisos, auditoría protegida, respaldos automáticos y sincronización entre dispositivos. El esquema deberá revisarse y ampliarse para los nuevos movimientos de devolución y reembolso antes de conectarlo.

El SRI no emite comprobantes. La tasa de IVA inicial del formulario es ilustrativa y debe definirse con el negocio antes de registrar datos reales. No se incluyen aportes ni ganancias de socios.

Los próximos pasos de negocio quedan pendientes: distribuir el costo completo de importación entre productos y distinguir existencias dañadas o no vendibles en devoluciones. La valoración actual es aproximada porque usa el costo unitario visible de cada producto. La antigüedad por cobrar cuenta desde la venta; todavía no hay fecha de vencimiento acordada. Una corrección de entrada actualiza el costo visible solo si aún coincide con el costo previo de esa entrada; una anulación no reconstruye costos históricos de producto.
