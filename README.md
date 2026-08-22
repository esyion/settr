# Agents Plus

跨设备同步个人 `~/AGENTS.md` 的 Tauri 桌面应用。

## 客户端与后端接入

客户端不会使用 mock 数据。业务数据全部来自 `D:/workspace/agents-plus-server` 提供的真实 API；本机文件、设备标识、会话凭据和原子写入由 Tauri Rust 层处理。

默认后端地址为 `http://localhost:19999`，可以通过设置页或 `.env` 中的 `NEXT_PUBLIC_API_BASE_URL` 修改。生产环境的远程地址必须使用 HTTPS。

已接入接口：认证注册/登录/刷新/退出/当前用户、设备列表/心跳/重命名/撤销、文档 head、版本分页/详情/提交/恢复，以及本地三方合并和冲突保护。

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

用户在多台电脑安装 Agents Plus 后，可以登录同一账号，将本机的 `~/AGENTS.md` 上传到云端，或者从云端拉取其他电脑上的最新版本。系统保留完整版本历史，并通过版本号、三方合并、冲突副本和原子写入避免误覆盖和数据丢失。
