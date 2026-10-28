# ImgX Studio

> Um estúdio GPT Image auto-hospedado para designers, times de marketing e criadores AI que querem transformar gpt-image-2 em um fluxo visual pronto para produção.

![ImgX Studio logo](./public/logo.png)

**Idioma:** [English](./README.md) | [简体中文](./README.zh-CN.md) | [繁體中文](./README.zh-TW.md) | [日本語](./README.ja.md) | [한국어](./README.ko.md) | [Español](./README.es.md) | [Français](./README.fr.md) | [Deutsch](./README.de.md) | [Português](./README.pt.md)

## Transforme GPT Image em um workspace criativo real

ImgX Studio é uma WebUI premium para **GPT Image / APIs de imagem compatíveis com OpenAI**. Ela reúne prompt, referências, ajustes de saída, geração de múltiplas opções, escolha do melhor resultado e iteração a partir da imagem selecionada em um fluxo único.

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

## Destaques

- **Feito para gpt-image-2**: opções `gpt-image-2`, `gpt-image-2-2026-04-21` e `gpt-image-1`.
- **Texto para imagem + imagem para imagem**: gere por prompt ou envie até 4 referências.
- **Iteração criativa**: use qualquer resultado como imagem fonte para a próxima rodada.
- **Multi-imagem mais confiável**: solicita 1-4 imagens como chamadas separadas para reduzir falhas por limites de batch.
- **Conexão flexível**: Browser direct ou Server proxy via `/api/images`.
- **Multilíngue**: UI e README em 9 idiomas.

## Casos de uso

| Fluxo | Exemplo |
| --- | --- |
| Hero de produto | Transforme fotos de produto em visuais premium para e-commerce, anúncios e redes sociais. |
| Exploração de campanha | Gere várias direções criativas e ramifique a partir da melhor. |
| Retoque comercial | Melhore artefatos, materiais, iluminação e composição. |
| Variações controladas | Mantenha sujeito e layout enquanto explora fundo, ângulo e estilo. |
| Deploy privado | Use no Vercel ou em seu servidor como ferramenta interna de imagem AI. |

## Início rápido

```bash
git clone <your-repo-url>
cd gpt-image-2-webui
npm install
cp .env.example .env.local
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000). Para Server proxy, configure `OPENAI_API_KEY` em `.env.local`.

## Deploy e privacidade

- Vercel: faça Fork, importe no Vercel e adicione `OPENAI_API_KEY` se necessário.
- Node.js: execute `npm run build` e depois `npm run start`.
- Browser direct envia a API Key do navegador para o endpoint configurado.
- Server proxy mantém a Key no servidor.
- **Remember on this device** armazena API Key e Base URL apenas no `localStorage` do navegador atual.

## Tech stack

Next.js 16, React 19, TypeScript, Tailwind CSS 4, shadcn/ui, Base UI, OpenAI Node SDK, Sonner Toast.

## License

This repository does not include a License file yet. Add MIT, Apache-2.0, or your preferred open-source license before formal release.
