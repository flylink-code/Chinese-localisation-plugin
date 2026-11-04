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
    summary: 'Claude 桌面客户端，Windows 存在官网安装包与 MSIX 渠道。',
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
]

const TOOL_IDS = TOOLS.map((tool) => tool.id)

function getTool(id) {
  return TOOLS.find((tool) => tool.id === id) || null
}

module.exports = { TOOLS, TOOL_IDS, getTool }
