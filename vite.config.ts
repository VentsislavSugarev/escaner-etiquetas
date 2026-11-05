import { defineConfig } from "vite";
import basicSsl from "@vitejs/plugin-basic-ssl";

// basicSsl crea un certificado HTTPS de prueba: sin HTTPS el móvil no deja usar la cámara.
export default defineConfig({
  plugins: [basicSsl()],
  server: {
    host: true, // escucha en la red local para poder abrirlo desde el móvil
  },
});
