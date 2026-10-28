# ImgX Studio

> Un studio GPT Image auto-hébergé pour designers, équipes marketing et créateurs IA qui veulent transformer gpt-image-2 en flux visuel prêt pour la production.

![ImgX Studio logo](./public/logo.png)

**Langue :** [English](./README.md) | [简体中文](./README.zh-CN.md) | [繁體中文](./README.zh-TW.md) | [日本語](./README.ja.md) | [한국어](./README.ko.md) | [Español](./README.es.md) | [Français](./README.fr.md) | [Deutsch](./README.de.md) | [Português](./README.pt.md)

## Transformez GPT Image en véritable espace créatif

ImgX Studio est une WebUI premium pour **GPT Image / API d'image compatibles OpenAI**. Elle regroupe brief, références, paramètres de sortie, génération de plusieurs options, sélection du meilleur visuel et itération depuis ce résultat.

## Captures d'écran

<p align="center">
  <img src="./public/img.png" alt="ImgX Studio workspace" width="100%">
</p>

<p align="center">
  <img src="./public/img_1.png" alt="ImgX Studio generation controls" width="100%">
</p>

<p align="center">
  <img src="./public/img_2.png" alt="ImgX Studio iteration workflow" width="100%">
</p>

## Points forts

- **Conçu pour gpt-image-2** : options `gpt-image-2`, `gpt-image-2-2026-04-21` et `gpt-image-1`.
- **Texte-image + image-image** : démarrez par un prompt ou importez jusqu'à 4 références.
- **Itération créative** : utilisez un résultat comme image source pour la génération suivante.
- **Multi-image plus fiable** : 1-4 sorties demandées séparément pour limiter les manques liés aux batchs.
- **Connexion flexible** : Browser direct ou Server proxy via `/api/images`.
- **Multilingue** : interface et README en 9 langues.

## Cas d'usage

| Flux | Exemple |
| --- | --- |
| Visuel hero produit | Transformer des photos produit en visuels premium e-commerce, publicité et social. |
| Exploration campagne | Générer plusieurs directions, comparer vite, puis repartir du meilleur choix. |
| Retouche commerciale | Corriger artefacts, matière, lumière et composition. |
| Variantes contrôlées | Garder sujet et layout tout en explorant fond, angle et ambiance. |
| Déploiement privé | Utiliser Vercel ou votre serveur comme outil interne d'images IA. |

## Démarrage rapide

```bash
git clone <your-repo-url>
cd gpt-image-2-webui
npm install
cp .env.example .env.local
npm run dev
```

Ouvrez [http://localhost:3000](http://localhost:3000). Pour le mode Server proxy, ajoutez `OPENAI_API_KEY` dans `.env.local`.

## Déploiement et confidentialité

- Vercel : fork du dépôt, import dans Vercel, puis ajout de `OPENAI_API_KEY` si nécessaire.
- Node.js : `npm run build`, puis `npm run start`.
- Browser direct envoie la clé API depuis le navigateur vers l'endpoint configuré.
- Server proxy permet de garder la clé côté serveur.
- **Remember on this device** stocke la clé API et la Base URL uniquement dans le `localStorage` du navigateur actuel.

## Tech stack

Next.js 16, React 19, TypeScript, Tailwind CSS 4, shadcn/ui, Base UI, OpenAI Node SDK, Sonner Toast.

## License

This repository does not include a License file yet. Add MIT, Apache-2.0, or your preferred open-source license before formal release.
