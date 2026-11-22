# Auditoría de cálculos · Torquex 1.4.1

Fecha: 2026-11-21. Alcance: código y datos ficticios de la versión local. No se inspeccionaron registros privados guardados en otros navegadores o equipos.

## Resultado

Se corrigieron dos errores:

1. El IVA podía quedar un centavo por debajo en subtotales como $13,70 al 15%: antes daba $2,05; ahora $2,06. El cálculo usa centavos enteros y redondeo de medio centavo hacia arriba por línea.
2. La exportación de una venta con varias piezas repetía el total, el cobro y el saldo de la venta en todas las filas. Ahora aparecen solo en la primera fila de esa venta.

Además, el formulario de producto rechaza costos y precios con más de dos decimales; la vista previa de venta usa la misma fórmula de IVA que el registro. Los respaldos se rechazan cuando tienen totales de venta o entrada inconsistentes. Las devoluciones, anulaciones y reembolsos no pueden registrarse con fechas anteriores a movimientos previos que alteran su saldo.

## Comprobaciones

- Ventas: subtotal = suma de cantidades por precio; IVA calculado por línea; total = subtotal + IVA.
- Devoluciones y anulaciones: importes originales y devueltos reconcilian a cero tras devolver todas las unidades; el stock regresa al saldo inicial.
- Cobros y reembolsos: saldo = venta neta − cobrado neto.
- Reportes: utilidad bruta = ventas sin IVA − costo vendido; resultado operativo = utilidad bruta − gastos vigentes. Las compras se muestran aparte y no se descuentan de nuevo.
- Entradas y correcciones: total = cantidad × costo unitario; la variación de unidades cambia el stock; no se permite saldo negativo.
- Valoración: suma de stock actual × costo unitario actual. Es una estimación, no un costo contable definitivo.
- Antigüedad por cobrar: agrupa el saldo actual según días desde la venta. No usa vencimientos contractuales.

Las 20 pruebas automatizadas pasan, incluidos miles de importes/tasas para IVA y 112 combinaciones de precio, cantidad, tasa y devolución. La compilación de producción también pasa.

Los datos ficticios del panel reconcilian: ventas sin IVA $232,60; IVA $34,89; costo vendido $138,00; gastos $109,50; utilidad bruta $94,60; resultado operativo −$14,90; cobros netos $206,29; por cobrar $61,20; valoración estimada $1.864,00.

## Límites de esta confirmación

Los registros de ventas creados antes de 1.4.1 conservan sus importes históricos. Algunos podrían contener el error de un centavo en IVA y requieren revisión individual; no se cambian automáticamente para preservar su historial. No se validó la tasa legal de IVA ni la emisión SRI. Faltan distribución de costos completos de importación, tratamiento de devoluciones dañadas, servidor, permisos y auditoría protegida. La revisión no equivale a certificación contable o fiscal de operaciones reales.
