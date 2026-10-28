# ImgX Studio

> デザイナー、マーケティングチーム、AI クリエイター向けのセルフホスト型 GPT Image ワークスペース。gpt-image-2 を、反復可能で納品に使える制作ツールにします。

![ImgX Studio logo](./public/logo.png)

**Language:** [English](./README.md) | [简体中文](./README.zh-CN.md) | [繁體中文](./README.zh-TW.md) | [日本語](./README.ja.md) | [한국어](./README.ko.md) | [Español](./README.es.md) | [Français](./README.fr.md) | [Deutsch](./README.de.md) | [Português](./README.pt.md)

## GPT Image を本格的な制作ワークスペースへ

ImgX Studio は **GPT Image / OpenAI-compatible image API** のためのプレミアム WebUI です。プロンプト作成、参照画像アップロード、サイズと品質の調整、複数案の生成、ベスト画像の選択、選択結果からの再生成まで、1 つの流れで完結します。

## スクリーンショット

<p align="center">
  <img src="./public/img.png" alt="ImgX Studio workspace" width="100%">
</p>

<p align="center">
  <img src="./public/img_1.png" alt="ImgX Studio generation controls" width="100%">
</p>

<p align="center">
  <img src="./public/img_2.png" alt="ImgX Studio iteration workflow" width="100%">
</p>

## 主な魅力

- **gpt-image-2 向けに設計**：`gpt-image-2`、`gpt-image-2-2026-04-21`、`gpt-image-1` を選択可能。
- **テキスト生成 + 画像編集**：プロンプトだけでも、最大 4 枚の参照画像からでも生成できます。
- **反復型ワークフロー**：生成結果を次のソース画像にして、バリエーション、レタッチ、アップスケール、局所修正へ進めます。
- **安定した複数画像生成**：1-4 枚の出力を個別リクエストとして扱い、バッチ制限による欠落を減らします。
- **2 つの接続方式**：Browser direct または `/api/images` 経由の Server proxy。
- **多言語対応**：UI と README は 9 言語に対応しています。

## ユースケース

| ワークフロー | 例 |
| --- | --- |
| 商品ヒーロービジュアル | 商品写真から EC、広告、SNS カバー向けの高品質ビジュアルを作成。 |
| キャンペーン探索 | 複数案を生成し、最も強い方向性からさらに派生。 |
| 商業レタッチ | アーティファクト、質感、光、構図を改善。 |
| コントロールされた変体 | 主体と構図を保ちながら、背景、角度、ムードを探索。 |
| プライベート導入 | Vercel や自社サーバーでチーム用 AI 画像ツールとして運用。 |

## クイックスタート

```bash
git clone <your-repo-url>
cd gpt-image-2-webui
npm install
cp .env.example .env.local
npm run dev
```

[http://localhost:3000](http://localhost:3000) を開きます。Server proxy を使う場合は `.env.local` に `OPENAI_API_KEY` を設定してください。

## デプロイとプライバシー

- Vercel：リポジトリを Fork して Vercel にインポートし、必要に応じて `OPENAI_API_KEY` を追加します。
- Node.js：`npm run build` の後に `npm run start`。
- Browser direct では、API Key はブラウザから設定した endpoint へ送信されます。
- Server proxy では、Key をサーバー環境変数に保持できます。
- **Remember on this device** は API Key と Base URL を現在のブラウザの `localStorage` にのみ保存します。

## Tech stack

Next.js 16、React 19、TypeScript、Tailwind CSS 4、shadcn/ui、Base UI、OpenAI Node SDK、Sonner Toast。

## License

This repository does not include a License file yet. Add MIT, Apache-2.0, or your preferred open-source license before formal release.
