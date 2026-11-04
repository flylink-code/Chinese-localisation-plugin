'use strict'

/**
 * 将仓库内附的 cc-zh 插件同步为应用内置插件资源。
 * 只复制运行所需文件，保留 MIT 许可证与来源说明。
 */
const fs = require('node:fs')
const fsp = fs.promises
const path = require('node:path')

const appRoot = path.resolve(__dirname, '..')
const source = path.join(appRoot, 'vendor', 'cc-zh')
const target = path.join(appRoot, 'resources', 'plugins', 'cc-zh')
const entries = ['.claude-plugin', 'hooks', 'dict.json', 'README.md']

async function main() {
  if (!fs.existsSync(path.join(source, '.claude-plugin', 'plugin.json'))) {
    throw new Error(`未找到源插件：${source}`)
  }
  await fsp.rm(target, { recursive: true, force: true })
  await fsp.mkdir(target, { recursive: true })
  for (const entry of entries) {
    const from = path.join(source, entry)
    await fsp.cp(from, path.join(target, entry), { recursive: true })
  }
  await fsp.copyFile(path.join(source, 'LICENSE'), path.join(target, 'LICENSE'))
  const manifest = JSON.parse(await fsp.readFile(path.join(source, '.claude-plugin', 'plugin.json'), 'utf8'))
  await fsp.writeFile(
    path.join(target, 'THIRD_PARTY.md'),
    [
      '# 第三方资源说明',
      '',
      '本目录包含 `cc-zh` Claude Code 简体中文界面插件，作为本软件的内置汉化资源。',
      '本软件是整合工具：只负责检测、安装、卸载与状态校验，汉化内容与实现的版权归原作者及其贡献者所有。',
      '',
      '- 来源：https://github.com/jiangnanquan/claude-code-zh/tree/8349fb97e1bfa68510227205a20c77876b0f50a3/mods/cc-zh',
      `- 版本：${manifest.version || '未知'}`,
      `- 作者：${manifest.author?.name || '未知'}`,
      `- 许可证：${manifest.license || 'MIT'}（见同目录 LICENSE）`,
      '',
      '本软件不修改插件内容，仅通过 Claude Code 官方插件扩展点加载该插件，不修改 Claude Code 程序文件。',
      '插件未覆盖全部界面文案，未命中的文案会保留英文。',
      '运行时下载的社区汉化源（Claude Desktop / Antigravity）不包含在本目录，也不随安装包分发；来源、固定提交、许可证与哈希见设置页与 `doc/ecosystem.md`。',
      '其他可适配软件与汉化项目的调研见仓库内 `doc/ecosystem.md`。',
      '',
    ].join('\n'),
    'utf8',
  )
  console.log(`已同步内置插件 ${manifest.name}@${manifest.version} -> ${target}`)
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
