import { defineConfig } from "vite";
import basicSsl from "@vitejs/plugin-basic-ssl";

// basicSsl crea un certificado HTTPS de prueba: sin HTTPS el móvil no deja usar la cámara.
export default defineConfig({
  // Rutas relativas: así funciona en GitHub Pages, que sirve la web en /<nombre-del-repo>/.
  base: "./",
  plugins: [basicSsl()],
  server: {
    host: true, // escucha en la red local para poder abrirlo desde el móvil
  },
});
