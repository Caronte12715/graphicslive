const fs = require('fs');
const path = require('path');

const templatesDir = path.join(__dirname, 'templates');
const files = fs.readdirSync(templatesDir).filter(f => f.endsWith('.html'));

for (const file of files) {
  const filePath = path.join(templatesDir, file);
  let html = fs.readFileSync(filePath, 'utf-8');

  // Check if it already has the message listener
  if (!html.includes("addEventListener('message'")) {
    const fallbackScript = `
    // Fallback: escuchar mensajes postMessage de Orbit y leer URL params
    window.addEventListener('message', (e) => {
      if (e.data?.action === 'update' && e.data.variables) {
        if (typeof update === 'function') {
          update(JSON.stringify(e.data.variables));
        }
      }
      if (e.data?.action === 'out') {
        if (typeof play === 'function') {
          if (isVisible) play();
        }
      }
    });

    window.addEventListener('DOMContentLoaded', () => {
      const params = new URLSearchParams(window.location.search);
      const vars = {};
      for(let [k,v] of params) {
        if(k !== 'path') vars[k] = v;
      }
      if(Object.keys(vars).length > 0 && typeof update === 'function') {
        update(JSON.stringify(vars));
      }
    });
  </script>`;

    html = html.replace('</script>\n\n  <script name="graphics-data-definition"', fallbackScript + '\n\n  <script name="graphics-data-definition"');
    
    // Also try another common replacement if the first one didn't match exactly
    if (!html.includes('window.addEventListener(\'message\'')) {
       html = html.replace(/<\/script>\s*<script name="graphics-data-definition"/, fallbackScript + '\n  <script name="graphics-data-definition"');
    }
    
    // If still not injected, inject before the closing body tag
    if (!html.includes('window.addEventListener(\'message\'')) {
       html = html.replace('</body>', '<script>' + fallbackScript + '\n</body>');
    }

    fs.writeFileSync(filePath, html, 'utf-8');
    console.log('Patched', file);
  }
}
