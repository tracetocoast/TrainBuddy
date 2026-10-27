/**
 * 小程序运行时配置
 * 开发者工具 / 真机调试：详情 → 本地设置 → 勾选「不校验合法域名、web-view、TLS」
 * 真机与电脑须同一 Wi-Fi；仅模拟器可用 127.0.0.1
 */
module.exports = {
  /** 真机调试用电脑局域网 IP；模拟器可改回 http://127.0.0.1:8787/api/v1 */
  API_BASE_URL: 'http://192.168.1.33:8787/api/v1',
  /** 使用真实后端（false 时才回退到历史 mock，正式交付应保持 true） */
  USE_REMOTE_API: true
}
