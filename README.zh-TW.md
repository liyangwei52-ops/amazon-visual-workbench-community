# ImgX Studio

> 面向設計師、行銷團隊與 AI 創作者的自託管 GPT 圖片工作台，讓 gpt-image-2 成為可迭代、可交付的創意生產工具。

![ImgX Studio logo](./public/logo.png)

**閱讀語言：** [English](./README.md) | [简体中文](./README.zh-CN.md) | [繁體中文](./README.zh-TW.md) | [日本語](./README.ja.md) | [한국어](./README.ko.md) | [Español](./README.es.md) | [Français](./README.fr.md) | [Deutsch](./README.de.md) | [Português](./README.pt.md)

## 把 GPT Image 變成真正的創意工作台

ImgX Studio 是一個面向設計師、品牌行銷、獨立開發者與 AI 圖片工作流團隊的 GPT 圖片生成 WebUI。它把 GPT Image / OpenAI-compatible image API 包裝成更順手的視覺化產品：撰寫 prompt、上傳參考圖、選擇尺寸與品質、批量出圖、挑選結果、繼續二創，一條鏈路完成。

## 產品截圖

<p align="center">
  <img src="./public/img.png" alt="ImgX Studio 工作台" width="100%">
</p>

<p align="center">
  <img src="./public/img_1.png" alt="ImgX Studio 參數與預覽" width="100%">
</p>

<p align="center">
  <img src="./public/img_2.png" alt="ImgX Studio 迭代工作流" width="100%">
</p>

## 為什麼值得 Star

- **更像產品，而不是腳手架**：品牌區、參數區、生成區、迭代區都圍繞真實創作流程設計。
- **支援文生圖 + 圖生圖**：可以從提示詞開始，也可以上傳參考圖做編輯、延展與變體。
- **適合商業圖像迭代**：選中生成結果後，可一鍵設為下一輪源圖，繼續精修、高清化、局部重繪或風格分叉。
- **更可靠的多圖生成**：選擇 1-4 張輸出時逐張請求，降低接口批量限制造成的少圖問題。
- **直連 / 代理兩種模式**：可瀏覽器直連 API，也可透過服務端代理隱藏團隊 Key。
- **多語言開箱即用**：界面與文檔覆蓋 English、简体中文、繁體中文、日本語、한국어、Español、Français、Deutsch、Português。

## 適合用來做什麼

| 場景 | 你可以怎麼用 |
| --- | --- |
| 產品主視覺 | 上傳產品圖，生成高端電商圖、廣告圖、社群封面。 |
| 創意探索 | 一次生成多張候選圖，快速比較方向，再從最佳圖繼續分叉。 |
| 商業精修 | 以結果圖為源圖繼續清理瑕疵、強化材質、改善光影。 |
| 變體分叉 | 保持主體和構圖，探索不同背景、角度、風格與氛圍。 |
| 私有部署 | 部署到伺服器或 Vercel，作為團隊內部 AI 圖片工具。 |

## 快速開始

```bash
git clone <your-repo-url>
cd gpt-image-2-webui
npm install
cp .env.example .env.local
npm run dev
```

打開 [http://localhost:3000](http://localhost:3000)。如果使用服務端代理模式，請在 `.env.local` 中填寫 `OPENAI_API_KEY`。

## 部署與隱私

- Vercel：Fork 倉庫，導入 Vercel，按需加入 `OPENAI_API_KEY`。
- Node.js：執行 `npm run build` 後使用 `npm run start`。
- Browser direct 模式會由瀏覽器直接請求你配置的 endpoint。
- Server proxy 模式會透過 `/api/images` 轉發，可把 Key 留在服務端。
- 勾選 **Remember on this device** 時，API Key 和 Base URL 只會保存在目前瀏覽器的 `localStorage`。

## 技術棧

Next.js 16、React 19、TypeScript、Tailwind CSS 4、shadcn/ui、Base UI、OpenAI Node SDK、Sonner Toast。

## License

目前倉庫尚未包含 License 文件。正式開源前建議補充 MIT、Apache-2.0 或你偏好的開源授權。
