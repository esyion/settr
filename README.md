# Agents Plus

跨设备同步个人 `~/.agents/AGENTS.md` 的 Tauri 桌面应用。

## 技术栈

- Tauri 2
- Next.js App Router（静态导出）
- React 19
- TypeScript
- Tailwind CSS 4
- shadcn/ui
- Rust 2021

## 开发

```bash
npm install
npm run tauri dev
```

Next.js 使用 `output: "export"`，生产构建输出到 `out/`，Tauri 的 `frontendDist` 指向 `../out`。桌面端不使用 SSR、Server Actions 或 Route Handlers。

## 质量检查

```bash
npm run lint
npm run build
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
```

## 文档

- [项目开发规范](./AGENTS.md)
- [系统设计方案](./docs/AGENTS-SYNC-SYSTEM-DESIGN.md)
- [UI 设计系统](./design-system/agents-plus/MASTER.md)

## 产品摘要

用户在多台电脑安装 Agents Plus 后，可以登录同一账号，将本机的 `~/.agents/AGENTS.md` 上传到云端，或者从云端拉取其他电脑上的最新版本。系统保留完整版本历史，并通过版本号、三方合并、冲突副本和原子写入避免误覆盖和数据丢失。
