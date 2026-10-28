const RETURN_PAGES: Record<string, string> = {
  "/": "视觉工作台",
  "/remix": "提示词迁移",
  "/planner": "一键策划",
  "/simple": "极简图文生图",
  "/settings": "API 设置",
  "/assets": "资产中心",
  "/profile": "个人中心",
  "/generate?source=workbench": "视觉工作台生成结果",
  "/generate?source=remix": "提示词迁移生成结果",
  "/generate?source=planner": "一键策划生成结果",
  "/generate?source=simple": "极简生图生成结果",
}

/** 仅允许已知站内入口；旧链接/直接访问回工作台，不依赖外部浏览历史。 */
export function suiteReturnTarget(value: string | null) {
  const href = value && Object.hasOwn(RETURN_PAGES, value) ? value : "/"
  return { href, label: RETURN_PAGES[href] }
}

export function suiteHref(returnTo: string) {
  return `/suite?${new URLSearchParams({ returnTo: suiteReturnTarget(returnTo).href })}`
}
