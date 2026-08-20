## MODIFIED Requirements

### Requirement: El listado de pedidos es paginado y se filtra completo
El listado de pedidos SHALL estar paginado y NO SHALL truncar el historial a un tope fijo. Todos los filtros —canal, estado, sección, rango de fechas y búsqueda— SHALL aplicarse sobre el conjunto completo de pedidos no borrados de la tienda y no sobre la página visible. Los pedidos borrados SHALL quedar excluidos de todo listado, búsqueda, conteo y exportación. La exportación SHALL abarcar el conjunto filtrado completo.

#### Scenario: Tienda con historial extenso
- **WHEN** una tienda acumuló más pedidos de los que entran en una página
- **THEN** puede recorrer todo su historial y ninguno queda inaccesible

#### Scenario: Filtro sobre el conjunto completo
- **WHEN** la dueña filtra por estado pendiente teniendo pedidos que superan una página
- **THEN** el resultado incluye todos los pendientes de la tienda y no solo los de la página que estaba viendo

#### Scenario: Exportación de una vista filtrada
- **WHEN** la dueña exporta con un filtro aplicado
- **THEN** el archivo contiene todos los pedidos que cumplen el filtro, no únicamente la página visible

#### Scenario: Los borrados no aparecen en la exportación
- **WHEN** la dueña exporta después de haber borrado pedidos
- **THEN** los pedidos borrados no figuran en el archivo

#### Scenario: Los borrados no cuentan en el backlog
- **WHEN** la dueña borra pedidos pendientes previos a la fecha de corte
- **THEN** el aviso de backlog deja de contarlos
