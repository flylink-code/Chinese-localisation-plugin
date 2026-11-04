'use strict'

/**
 * 首批支持目录。能力（apply/uninstall）由各适配器依据真实实例与版本计算，
 * 此处只描述产品身份，不声明已经验证支持的版本。
 */
const TOOLS = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    vendor: 'Anthropic',
    summary: '终端 AI 编程 Agent，包含 CLI 与 IDE 扩展两种形态。',
    icon: 'terminal',
    accent: '#d97757',
    forms: ['CLI', 'IDE 扩展'],
  },
  {
    id: 'claude-desktop',
    name: 'Claude Desktop',
    vendor: 'Anthropic',
    summary: 'Claude 桌面客户端，Windows 支持官网安装包与 MSIX，Linux 支持 deb 包。',
    icon: 'desktop',
    accent: '#c15f3c',
    forms: ['桌面应用'],
  },
  {
    id: 'antigravity',
    name: 'Antigravity',
    vendor: 'Google',
    summary: '基于 Electron 的 AI 开发桌面应用。',
    icon: 'sparkles',
    accent: '#4f6bff',
    forms: ['桌面应用'],
  },
  {
    id: 'cursor',
    name: 'Cursor',
    vendor: 'Anysphere',
    summary: 'AI 原生代码编辑器，支持全量词典替换与备份还原。',
    icon: 'apps',
    accent: '#0ea5e9',
    forms: ['桌面应用'],
  },
  {
    id: 'codex-desktop',
    name: 'Codex Desktop',
    vendor: 'OpenAI',
    summary: 'OpenAI Codex 桌面客户端，支持免改包语言注入与便携版汉化。',
    icon: 'desktop',
    accent: '#10a37f',
    forms: ['桌面应用'],
  },
  {
    id: 'kiro',
    name: 'Kiro',
    vendor: 'AWS Kiro',
    summary: 'AWS Agentic AI IDE，支持简体/繁体中文语言包与界面补丁。',
    icon: 'sparkles',
    accent: '#8b5cf6',
    forms: ['桌面应用'],
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    vendor: 'Anomaly',
    summary: '开源终端 AI 编程 Agent，支持 TUI 渲染层词典插件与中文终端构建版。',
    icon: 'terminal',
    accent: '#f59e0b',
    forms: ['CLI / TUI'],
  },
]

const TOOL_IDS = TOOLS.map((tool) => tool.id)

function getTool(id) {
  return TOOLS.find((tool) => tool.id === id) || null
}

module.exports = { TOOLS, TOOL_IDS, getTool }
