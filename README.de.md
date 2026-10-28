# ImgX Studio

> Ein selbst gehostetes GPT Image Studio für Designer, Marketing-Teams und AI-Creators, die gpt-image-2 in einen produktionsreifen visuellen Workflow verwandeln möchten.

![ImgX Studio logo](./public/logo.png)

**Sprache:** [English](./README.md) | [简体中文](./README.zh-CN.md) | [繁體中文](./README.zh-TW.md) | [日本語](./README.ja.md) | [한국어](./README.ko.md) | [Español](./README.es.md) | [Français](./README.fr.md) | [Deutsch](./README.de.md) | [Português](./README.pt.md)

## GPT Image als echtes Kreativ-Workspace

ImgX Studio ist eine Premium-WebUI für **GPT Image / OpenAI-kompatible Image APIs**. Prompt, Referenzbilder, Ausgabeparameter, mehrere Kandidaten, Auswahl des besten Ergebnisses und weitere Iterationen aus diesem Bild laufen in einem fokussierten Workflow zusammen.

## Screenshots

<p align="center">
  <img src="./public/img.png" alt="ImgX Studio workspace" width="100%">
</p>

<p align="center">
  <img src="./public/img_1.png" alt="ImgX Studio generation controls" width="100%">
</p>

<p align="center">
  <img src="./public/img_2.png" alt="ImgX Studio iteration workflow" width="100%">
</p>

## Highlights

- **Für gpt-image-2 entwickelt**: Optionen für `gpt-image-2`, `gpt-image-2-2026-04-21` und `gpt-image-1`.
- **Text-to-Image + Image-to-Image**: Start per Prompt oder mit bis zu 4 Referenzbildern.
- **Kreative Iteration**: Ergebnisse als Quelle für die nächste Runde verwenden.
- **Zuverlässigere Mehrbild-Ausgabe**: 1-4 Bilder werden als getrennte Calls angefragt, um Batch-Limits zu umgehen.
- **Flexible Verbindung**: Browser direct oder Server proxy über `/api/images`.
- **Mehrsprachig**: UI und README in 9 Sprachen.

## Einsatzbereiche

| Workflow | Beispiel |
| --- | --- |
| Product Hero Shots | Produktfotos in hochwertige E-Commerce-, Anzeigen- und Social-Visuals verwandeln. |
| Kampagnen-Exploration | Mehrere kreative Richtungen erzeugen und vom stärksten Ergebnis weiter verzweigen. |
| Commercial Retouching | Artefakte, Material, Licht und Komposition verbessern. |
| Kontrollierte Varianten | Motiv und Layout stabil halten, während Hintergrund, Winkel und Stil variieren. |
| Private Bereitstellung | Auf Vercel oder eigenem Server als internes AI-Bildtool betreiben. |

## Quick Start

```bash
git clone <your-repo-url>
cd gpt-image-2-webui
npm install
cp .env.example .env.local
npm run dev
```

Öffne [http://localhost:3000](http://localhost:3000). Für Server proxy bitte `OPENAI_API_KEY` in `.env.local` setzen.

## Deployment und Datenschutz

- Vercel: Repository forken, in Vercel importieren und bei Bedarf `OPENAI_API_KEY` hinzufügen.
- Node.js: `npm run build`, danach `npm run start`.
- Browser direct sendet den API Key vom Browser an den konfigurierten Endpoint.
- Server proxy hält den Key auf dem Server.
- **Remember on this device** speichert API Key und Base URL nur im `localStorage` des aktuellen Browsers.

## Tech stack

Next.js 16, React 19, TypeScript, Tailwind CSS 4, shadcn/ui, Base UI, OpenAI Node SDK, Sonner Toast.

## License

This repository does not include a License file yet. Add MIT, Apache-2.0, or your preferred open-source license before formal release.
