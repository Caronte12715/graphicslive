# Orbit - Motor de Gráficos para Transmisiones en Vivo

<p align="center">
  <strong>Una alternativa profesional, moderna y personalizable a H2R Graphics.</strong>
</p>

<p align="center">
  <a href="https://github.com/Caronte12715/graphicslive/releases/tag/v1.1.0">
    <img src="https://img.shields.io/badge/Descargar%20para%20Windows-v1.1.0-blue?style=for-the-badge&logo=windows&logoColor=white" alt="Descargar para Windows" />
  </a>
</p>


---

**Orbit** es una aplicación de escritorio desarrollada con **Electron** diseñada para productores de contenido y realizadores de transmisiones en vivo. Permite renderizar overlays gráficos dinámicos y profesionales en tiempo real, ideales para integrarse directamente con softwares de streaming como **OBS Studio**, **vMix**, **Wirecast**, etc.

El sistema funciona de forma dual: un panel de control interactivo para gestionar los gráficos y una salida de video limpia (Renderer) basada en HTML/CSS/JS que se puede capturar como fuente de navegador.

---

## 🚀 Características Principales

- 🎨 **Plantillas Profesionales Listas para Usar**:
  - *Lower Thirds* animados (simples, dobles, estilo pastor, etc.)
  - Marcadores deportivos (*Scoreboards*)
  - Pantallas completas (*Full Screen Titles*)
  - Widgets del clima, tickers informativos y alertas de *Breaking News*
  - Cuentas regresivas, tarjetas de enfrentamientos (Versus) y más.
- ⚡ **Sincronización en Tiempo Real**: Todo funciona instantáneamente gracias a un servidor local **WebSocket**.
- 📱 **Control Remoto Móvil**: Incluye un servidor web local que te permite controlar toda la transmisión desde tu teléfono móvil o tableta.
- 🌐 **Acceso Público (Localtunnel)**: Controla la transmisión de forma remota a través de internet con túneles seguros e ilimitados.
- 🛠️ **Fácil Personalización**: Las plantillas son HTML puro, por lo que puedes editarlas o crear las tuyas usando CSS y JS vanilla.
- 💻 **Instalador de Windows integrado**: Configurado para empaquetarse en un instalador nativo y profesional con tu propia marca.

---

## 🛠️ Tecnologías Utilizadas

- **Core**: HTML, CSS, JavaScript (Vanilla y HSL tailwind-inspired presets).
- **Desktop**: [Electron](https://www.electronjs.org/) para la aplicación nativa.
- **Backend & Networking**:
  - [Express](https://expressjs.com/) para servir el panel de control remoto y recursos.
  - [ws (WebSockets)](https://github.com/websockets/ws) para comunicación en tiempo real de baja latencia.
  - [Chokidar](https://github.com/paulmillr/chokidar) para recarga en caliente de templates modificados.
  - [Localtunnel](https://github.com/localtunnel/localtunnel) para conexiones remotas externas.
- **Empaquetado**: [Electron Builder](https://www.electron.build/) para generar el instalador de Windows.

---

## 💻 Primeros Pasos (Desarrollo)

### Requisitos Previos

Asegúrate de tener instalado [Node.js](https://nodejs.org/) (versión 16 o superior recomendada).

### 1. Clonar el repositorio
```bash
git clone https://github.com/Caronte12715/graphicslive.git
cd graphicslive
```

### 2. Instalar dependencias
```bash
npm install
```

### 3. Ejecutar en modo desarrollo
```bash
npm run dev
```

---

## 📦 Compilación y Distribución

Para generar un instalador ejecutable `.exe` optimizado para Windows:

```bash
npm run build
```
El instalador se generará en la carpeta `dist/` con las configuraciones personalizadas y accesos directos automáticos.

---

## 🤝 Contribuir

¡Las contribuciones son bienvenidas! Si deseas añadir nuevas plantillas animadas o mejorar las funciones del servidor, no dudes en abrir un *Pull Request* o reportar un *Issue*.

---

## 👤 Autor

Desarrollado y mantenido por **David** ([Caronte12715](https://github.com/Caronte12715)).

---

## 📄 Licencia

Este proyecto está bajo la Licencia **MIT**. Consulta el archivo `LICENSE` para más detalles.

