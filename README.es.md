# ImgX Studio

> Un estudio GPT Image autoalojado para diseñadores, equipos de marketing y creadores AI que necesitan convertir gpt-image-2 en un flujo visual listo para producción.

![ImgX Studio logo](./public/logo.png)

**Idioma:** [English](./README.md) | [简体中文](./README.zh-CN.md) | [繁體中文](./README.zh-TW.md) | [日本語](./README.ja.md) | [한국어](./README.ko.md) | [Español](./README.es.md) | [Français](./README.fr.md) | [Deutsch](./README.de.md) | [Português](./README.pt.md)

## Convierte GPT Image en un espacio creativo real

ImgX Studio es una WebUI premium para **GPT Image / APIs de imagen compatibles con OpenAI**. Reúne prompt, referencias, tamaño, calidad, múltiples candidatos, selección del mejor resultado e iteración desde la imagen elegida en un solo flujo.

## Capturas

<p align="center">
  <img src="./public/img.png" alt="ImgX Studio workspace" width="100%">
</p>

<p align="center">
  <img src="./public/img_1.png" alt="ImgX Studio generation controls" width="100%">
</p>

<p align="center">
  <img src="./public/img_2.png" alt="ImgX Studio iteration workflow" width="100%">
</p>

## Por qué destaca

- **Diseñado para gpt-image-2**: incluye `gpt-image-2`, `gpt-image-2-2026-04-21` y `gpt-image-1`.
- **Texto a imagen + imagen a imagen**: genera desde prompt o sube hasta 4 referencias.
- **Iteración creativa**: usa cualquier resultado como imagen fuente para la siguiente ronda.
- **Generación múltiple fiable**: solicita 1-4 imágenes como llamadas separadas para reducir faltantes por límites de batch.
- **Conexión flexible**: Browser direct o Server proxy mediante `/api/images`.
- **Multilingüe**: UI y README disponibles en 9 idiomas.

## Casos de uso

| Flujo | Ejemplo |
| --- | --- |
| Hero de producto | Convierte fotos de producto en visuales premium para e-commerce, anuncios y redes. |
| Exploración de campaña | Genera direcciones creativas y ramifica desde la mejor. |
| Retoque comercial | Mejora artefactos, materiales, iluminación y composición. |
| Variaciones controladas | Mantén sujeto y layout mientras exploras fondo, ángulo y estilo. |
| Despliegue privado | Úsalo en Vercel o en tu servidor como herramienta interna. |

## Inicio rápido

```bash
git clone <your-repo-url>
cd gpt-image-2-webui
npm install
cp .env.example .env.local
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000). Para Server proxy, configura `OPENAI_API_KEY` en `.env.local`.

## Despliegue y privacidad

- Vercel: haz Fork, importa el repositorio y añade `OPENAI_API_KEY` si lo necesitas.
- Node.js: ejecuta `npm run build` y luego `npm run start`.
- Browser direct envía la API Key desde el navegador al endpoint configurado.
- Server proxy mantiene la Key en el servidor.
- **Remember on this device** guarda API Key y Base URL solo en el `localStorage` del navegador actual.

## Tech stack

Next.js 16, React 19, TypeScript, Tailwind CSS 4, shadcn/ui, Base UI, OpenAI Node SDK, Sonner Toast.

## License

This repository does not include a License file yet. Add MIT, Apache-2.0, or your preferred open-source license before formal release.
