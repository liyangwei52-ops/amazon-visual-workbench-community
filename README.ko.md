# ImgX Studio

> 디자이너, 마케팅 팀, AI 크리에이터를 위한 셀프 호스팅 GPT Image 워크스페이스입니다. gpt-image-2를 반복 가능한 제작 도구로 바꿉니다.

![ImgX Studio logo](./public/logo.png)

**Language:** [English](./README.md) | [简体中文](./README.zh-CN.md) | [繁體中文](./README.zh-TW.md) | [日本語](./README.ja.md) | [한국어](./README.ko.md) | [Español](./README.es.md) | [Français](./README.fr.md) | [Deutsch](./README.de.md) | [Português](./README.pt.md)

## GPT Image를 실전 제작 워크스페이스로

ImgX Studio는 **GPT Image / OpenAI-compatible image API**를 위한 프리미엄 WebUI입니다. 프롬프트 작성, 레퍼런스 이미지 업로드, 품질과 크기 조정, 여러 후보 생성, 결과 선택, 선택한 이미지에서 다음 라운드로 이어지는 흐름을 하나의 작업 공간에 담았습니다.

## 스크린샷

<p align="center">
  <img src="./public/img.png" alt="ImgX Studio workspace" width="100%">
</p>

<p align="center">
  <img src="./public/img_1.png" alt="ImgX Studio generation controls" width="100%">
</p>

<p align="center">
  <img src="./public/img_2.png" alt="ImgX Studio iteration workflow" width="100%">
</p>

## 주요 장점

- **gpt-image-2 중심 설계**: `gpt-image-2`, `gpt-image-2-2026-04-21`, `gpt-image-1` 모델 옵션을 제공합니다.
- **텍스트-이미지 + 이미지-이미지**: 프롬프트만으로 생성하거나 최대 4장의 레퍼런스 이미지를 업로드할 수 있습니다.
- **반복 제작 흐름**: 생성 결과를 다음 소스 이미지로 지정하고 변형, 보정, 업스케일, 부분 수정으로 이어갑니다.
- **안정적인 다중 이미지 생성**: 1-4개 출력을 개별 요청으로 처리해 배치 제한으로 인한 누락을 줄입니다.
- **유연한 연결 방식**: Browser direct 또는 `/api/images` 기반 Server proxy를 선택할 수 있습니다.
- **다국어 지원**: UI와 README가 9개 언어를 지원합니다.

## 활용 시나리오

| 워크플로 | 예시 |
| --- | --- |
| 제품 히어로 이미지 | 제품 사진을 프리미엄 이커머스, 광고, SNS 커버 이미지로 전환합니다. |
| 캠페인 탐색 | 여러 방향을 생성하고 가장 강한 결과에서 다시 분기합니다. |
| 상업용 보정 | 아티팩트, 재질감, 조명, 구도를 개선합니다. |
| 제어된 변형 | 주제와 구도를 유지하면서 배경, 각도, 무드를 탐색합니다. |
| 프라이빗 배포 | Vercel 또는 자체 서버에서 팀 내부 AI 이미지 도구로 운영합니다. |

## 빠른 시작

```bash
git clone <your-repo-url>
cd gpt-image-2-webui
npm install
cp .env.example .env.local
npm run dev
```

[http://localhost:3000](http://localhost:3000)을 엽니다. Server proxy를 사용하려면 `.env.local`에 `OPENAI_API_KEY`를 설정하세요.

## 배포와 개인정보

- Vercel: 저장소를 Fork하고 Vercel에 가져온 뒤 필요하면 `OPENAI_API_KEY`를 추가합니다.
- Node.js: `npm run build` 후 `npm run start`를 실행합니다.
- Browser direct 모드에서는 API Key가 브라우저에서 설정한 endpoint로 전송됩니다.
- Server proxy 모드에서는 Key를 서버 환경 변수에 둘 수 있습니다.
- **Remember on this device**는 API Key와 Base URL을 현재 브라우저의 `localStorage`에만 저장합니다.

## Tech stack

Next.js 16, React 19, TypeScript, Tailwind CSS 4, shadcn/ui, Base UI, OpenAI Node SDK, Sonner Toast.

## License

This repository does not include a License file yet. Add MIT, Apache-2.0, or your preferred open-source license before formal release.
