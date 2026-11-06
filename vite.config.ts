import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";
import basicSsl from "@vitejs/plugin-basic-ssl";

// Archivos de public/ que también hacen falta sin conexión (los de assets/ se añaden solos).
const PUBLIC_FILES = ["./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./apple-touch-icon.png"];

// Al compilar, escribe en dist/sw.js la lista de archivos de esta versión y un nombre de caché
// que cambia con ellos. Así el service worker puede guardar la app entera al instalarse.
function filesForServiceWorker(): Plugin {
  let swPath = "";
  return {
    name: "files-for-service-worker",
    apply: "build", // solo al compilar (npm run build), no en "npm run dev"
    configResolved(config) {
      swPath = resolve(config.root, config.build.outDir, "sw.js");
    },
    writeBundle(_options, bundle) {
      const built = Object.keys(bundle).filter((f) => f !== "index.html").map((f) => `./${f}`);
      const files = ["./", ...built, ...PUBLIC_FILES];
      const html = bundle["index.html"];
      const htmlSource = html && html.type === "asset" ? String(html.source) : "";
      // La versión depende de la lista de archivos Y del contenido de index.html.
      const version = createHash("sha1").update(files.join()).update(htmlSource).digest("hex").slice(0, 8);
      const sw = readFileSync(swPath, "utf8")
        .replace('const FILES = ["./"];', `const FILES = ${JSON.stringify(files)};`)
        .replace('const CACHE = "escaner-dev";', `const CACHE = "escaner-${version}";`);
      // Si alguien cambia esas dos líneas de sw.js, mejor que falle la compilación que publicar sin copia offline.
      if (!sw.includes(`"escaner-${version}"`) || !sw.includes(JSON.stringify(files))) {
        throw new Error("files-for-service-worker: no encuentro FILES/CACHE en public/sw.js");
      }
      writeFileSync(swPath, sw);
    },
  };
}

// basicSsl crea un certificado HTTPS de prueba: sin HTTPS el móvil no deja usar la cámara.
// "vite --mode http" lo desactiva (solo para probar en el propio PC con http://localhost).
export default defineConfig(({ mode }) => ({
  // Rutas relativas: así funciona en GitHub Pages, que sirve la web en /<nombre-del-repo>/.
  base: "./",
  plugins: [filesForServiceWorker(), ...(mode === "http" ? [] : [basicSsl()])],
  server: {
    host: true, // escucha en la red local para poder abrirlo desde el móvil
  },
}));
