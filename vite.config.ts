import { defineConfig } from "vite";
import basicSsl from "@vitejs/plugin-basic-ssl";

// basicSsl crea un certificado HTTPS de prueba: sin HTTPS el móvil no deja usar la cámara.
// "vite --mode http" lo desactiva (solo para probar en el propio PC con http://localhost).
export default defineConfig(({ mode }) => ({
  // Rutas relativas: así funciona en GitHub Pages, que sirve la web en /<nombre-del-repo>/.
  base: "./",
  plugins: mode === "http" ? [] : [basicSsl()],
  server: {
    host: true, // escucha en la red local para poder abrirlo desde el móvil
  },
}));
