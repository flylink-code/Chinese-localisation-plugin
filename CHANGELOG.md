# 更新日志

本文件记录面向用户的版本变更。版本号与 GitHub Release 标签使用同一套语义化版本（`vX.Y.Z`）。

## 0.1.2 — 2026年11月04日

- 修复打开 Claude Desktop 详情时整个界面变黑：该适配器返回的检测结果缺少 `evidence` 字段，导致详情页渲染中断；现补齐该字段并新增回归测试。

## 0.1.1 — 2026年11月04日

- 新增 Ubuntu 22.04 支持：Claude Code CLI 检测、应用汉化与卸载汉化闭环；Claude Desktop deb 与 Antigravity Linux 安装路径检测。
- 新增 Windows NSIS、Ubuntu AppImage 与 deb 安装包（未签名）。
- 新增 GitHub Actions 标签构建：推送 `vX.Y.Z` 标签后自动构建并上传安装包。
- 修复 Linux 路径大小写比较与测试脚本跨平台问题。
- 已知限制：真实客户端中文界面尚未验证；Desktop / Antigravity 不提供写入；暂无自动更新与 macOS 支持。

## 0.1.0 — 2026年11月04日

首个可运行 MVP：

- 现代化桌面主页：三类软件安装检测、汉化状态、详情抽屉、搜索筛选、浅色/深色主题。
- Claude Code CLI：通过官方插件扩展点应用与卸载汉化，写前备份，只撤销本软件写入的改动。
- Claude Desktop、Antigravity：检测与汉化状态检查；暂不提供写入。
- 操作记录与本地设置。
- 设置页手动检查 GitHub Releases 更新；不自动下载或安装。
- 已知限制：真实客户端中文界面尚未验证；暂无安装包、自动更新、macOS / Linux 支持。
