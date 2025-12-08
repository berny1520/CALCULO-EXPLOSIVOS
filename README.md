# Xtreme Mining · Sistema de Cálculo de Explosivos

Software web sencillo para el cálculo y registro de disparos en minería subterránea.

## Autor

- **Bernardo Ojeda**  
  Jefe de Innovación y Formación · Xtreme Mining

## Funcionalidades

- Ingreso de parámetros del disparo:
  - Mina (Xtreme Andina, Teniente, Chuquicamata, Carpetas, etc.)
  - Contrato
  - Dimensiones de la sección (ancho y alto)
  - Largo de perforación
  - Número de perforaciones
  - Factor de carga objetivo (kg eq/m³)
  - Proporciones de Emultex, Famecorte y ANFO

- Cálculos automáticos:
  - Área de sección y volumen excavado
  - Carga total equivalente (kg eq)
  - Factor de carga resultante
  - Kg reales y cartuchos estimados por tipo de explosivo

- Registro histórico:
  - Se guarda automáticamente en `localStorage` del navegador
  - Se visualiza en una tabla con scroll

- Filtros:
  - Por mina
  - Por contrato

- Gráficos dinámicos (Chart.js):
  - Carga de explosivos por disparo
  - Factor de carga por disparo

## Cómo usar

1. Clonar o descargar el repositorio.
2. Abrir `index.html` en un navegador moderno (Chrome, Edge, Firefox).
3. Ingresar los datos del disparo y presionar **"Calcular y Registrar"**.
4. Ver resultados, tabla y gráficos.

## GitHub Pages

Para publicar el software como página:

1. Subir el proyecto a GitHub.
2. En el repositorio ir a **Settings → Pages**.
3. Elegir **Branch: main** y **/root**.
4. Guardar.  
   GitHub generará una URL pública donde se podrá usar el sistema desde cualquier navegador.
