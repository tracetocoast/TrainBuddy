/**
 * 小程序运行时配置
 * 开发者工具：详情 → 本地设置 → 勾选「不校验合法域名」
 */
module.exports = {
  /** 本地 Node API；真机调试改为电脑局域网 IP */
  API_BASE_URL: 'http://127.0.0.1:8787/api/v1',
  /** 使用真实后端（false 时才回退到历史 mock，正式交付应保持 true） */
  USE_REMOTE_API: true
}
