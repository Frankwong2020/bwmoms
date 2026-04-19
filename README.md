# 桥水小娃群 · Bridgewater 华人家庭生活指南

NJ 中部华人家庭社区共享的遛娃、医生、维修师傅、课外班推荐。

**Live**: https://bridgewaterkids.netlify.app (pending deploy)

## 数据来源

初始数据来自桥水小娃群共享的 [Google Sheet](https://docs.google.com/spreadsheets/d/10D1aw4824h88jIlXJf2MWmTq8egR0CcNWl7gKQadRPY/edit)。

- `data-raw/` — 从 Sheet 拉取的原始 CSV
- `src/data/*.json` — 解析后的结构化数据（构建时直接导入）

## 技术栈

- **Astro 4** — 静态站点生成，零 JS 默认，部署产物即 HTML
- **TypeScript + Tailwind CSS**
- **Netlify** — 免费托管，Git push 自动部署

## 本地开发

```bash
npm install
npm run dev     # http://localhost:4321
npm run build   # 输出到 dist/
```

## 重新从 Sheet 同步数据

1. 下载 CSV：
   ```bash
   # 见 scripts/fetch-sheet.sh（TODO）
   ```
2. 解析成 JSON：
   ```bash
   node scripts/parse-csv.mjs
   ```

## 路线图

- [x] Phase 1: 静态站点 + 全部数据导入 + Netlify 部署
- [x] Phase 2: Google 登录 + 评分 + 评论（Supabase）
- [ ] Phase 3: 维基式编辑 + 编辑历史 + 举报/审核

## 环境变量

本地 `.env`（从 `.env.example` 复制）和 Netlify 部署环境都需要：

```
PUBLIC_SUPABASE_URL=https://xxx.supabase.co
PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
```

（anon key 是公开值，不是秘密 — 浏览器会直接使用它。）

## 贡献

欢迎 PR：
- 修正数据错误（编辑 `src/data/*.json` 或 `data-raw/*.csv`）
- 添加新地点/服务（在对应 JSON 追加条目）
- UI 改进

## License

MIT
