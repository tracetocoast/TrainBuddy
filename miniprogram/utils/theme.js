/**
 * V1.5 皮肤系统：白色（默认，现状不变）/ 黑色两套皮肤。
 * 通过页面根节点 skinClass 挂 .skin-dark 切换 CSS 变量；页面 JS 无需感知。
 */
const STORAGE_KEY = 'lianzida_skin'

const SKINS = {
  light: {
    skinClass: '',
    navBg: '#ffffff',
    navFront: '#000000',
    winBg: '#ffffff'
  },
  dark: {
    skinClass: 'skin-dark',
    navBg: '#090909',
    navFront: '#ffffff',
    winBg: '#090909'
  }
}

function getSkin() {
  try {
    return wx.getStorageSync(STORAGE_KEY) === 'dark' ? 'dark' : 'light'
  } catch (e) {
    return 'light'
  }
}

function setSkin(skin) {
  const value = skin === 'dark' ? 'dark' : 'light'
  try {
    wx.setStorageSync(STORAGE_KEY, value)
  } catch (e) {
    // 存储失败时仅本次会话生效
  }
  return value
}

function colors(skin) {
  return SKINS[skin === 'dark' || skin === 'light' ? skin : getSkin()]
}

/** 立刻改原生窗口/导航栏底色，不依赖页面 data。切页前调用，缩短露浅色底的空窗。 */
function applyNativeWindow(skin) {
  const conf = colors(skin)
  try {
    wx.setNavigationBarColor({
      frontColor: conf.navFront,
      backgroundColor: conf.navBg,
      fail: () => {}
    })
    wx.setBackgroundColor({
      backgroundColor: conf.winBg,
      backgroundColorTop: conf.winBg,
      backgroundColorBottom: conf.winBg,
      fail: () => {}
    })
  } catch (e) {
    // 部分环境不支持时忽略，页面内配色仍由 skinClass 生效
  }
  return conf
}

/** 在页面 onLoad / onShow 中调用：注入根节点 class 与 page-meta 背景色，并同步导航栏/窗口底色 */
function applyToPage(page) {
  if (!page || !page.setData) return getSkin()
  const skin = getSkin()
  const conf = colors(skin)
  if (page.data.skinClass !== conf.skinClass || page.data.pageBg !== conf.winBg) {
    page.setData({ skinClass: conf.skinClass, pageBg: conf.winBg })
  }
  applyNativeWindow(skin)
  return skin
}

function redirectTo(url) {
  applyNativeWindow()
  wx.redirectTo({ url })
}

module.exports = { getSkin, setSkin, applyToPage, applyNativeWindow, colors, redirectTo }
