// One-time, idempotent migration of legacy page palettes to shared design tokens.
const fs = require('node:fs')
const path = require('node:path')
const root = path.resolve(__dirname, '..', 'miniprogram')
const palette = {
  '#fafbf7':'var(--paper)', '#25352c':'var(--ink)', '#2e452f':'var(--ink)', '#354932':'var(--ink)',
  '#6e7c72':'var(--muted)', '#74806d':'var(--muted)', '#718168':'var(--muted)', '#64765d':'var(--muted)',
  '#68815c':'var(--muted)', '#84917c':'var(--muted)', '#788471':'var(--muted)', '#8b9984':'var(--muted)',
  '#8a958b':'#738093', '#85907d':'#738093', '#899180':'#738093', '#7a8776':'var(--muted)',
  '#809175':'var(--muted)', '#66845c':'var(--muted)', '#6c875d':'var(--muted)', '#71806b':'var(--muted)',
  '#6e8861':'var(--muted)', '#5f7565':'var(--muted)', '#4a7046':'var(--accent)', '#446a42':'var(--accent)',
  '#28744e':'var(--accent)', '#1f5c3d':'var(--accent)', '#5f8054':'var(--accent)', '#57724a':'var(--accent)',
  '#486540':'var(--accent)', '#466941':'var(--accent)', '#53764a':'var(--accent)', '#597b4e':'var(--accent)',
  '#449361':'var(--accent)', '#7ba46c':'var(--accent)', '#a5c5a7':'#b7c6f9',
  '#e0e7dc':'var(--line)', '#e0ead6':'var(--line)', '#dfe9d6':'var(--line)', '#dce7d5':'var(--line)',
  '#d4e3cc':'var(--line)', '#cbdac1':'#b9c5d6', '#dfe8d8':'var(--line)', '#e5ebdf':'var(--line)',
  '#e6f0e4':'#edf1ff', '#edf4e6':'#edf1ff', '#eef3ea':'var(--surface-raised)', '#eef4e9':'#edf1ff',
  '#edf3e8':'#edf1ff', '#f1f4ee':'var(--surface-raised)', '#f1f5ed':'var(--surface-raised)',
  '#f7f9f2':'#f7f9fc', '#f3f7ed':'#f7f9fc', '#dfead4':'#dfe7ff', '#edf1e8':'var(--surface-raised)',
  '#e7ede2':'var(--surface-raised)', '#edf1e9':'var(--surface-raised)',
  '#d5dfce':'#d6dee8', '#cfddc9':'#c7d2e2', '#9cb894':'#8b9db9', '#f5f8ef':'var(--paper)',
  '#9aa59b':'#738093', '#c5d9c2':'var(--line)', '#7fb59a':'var(--accent)',
  '#7d9170':'var(--muted)', '#5f7f51':'var(--muted)', '#819377':'var(--muted)',
  '#9bb58e':'#94a6c1', '#b6cba8':'var(--line)', '#809076':'var(--muted)',
  '#7b8874':'var(--muted)', '#57784c':'var(--ink)', '#8e9a86':'var(--muted)',
  '#4a5c45':'var(--ink)', '#6a7a64':'var(--muted)', '#2f3d2c':'var(--ink)',
  '#d5e0ce':'var(--line)', '#7a8774':'var(--muted)', '#71816a':'var(--muted)',
  '#899780':'var(--muted)', '#b8cfad':'var(--line)', '#7d8d73':'var(--muted)',
  '#89967f':'var(--muted)', '#839078':'var(--muted)', '#527648':'var(--accent)',
  '#94a18d':'var(--muted)', '#f5f7f0':'var(--surface-raised)', '#e8eee3':'var(--line)',
  '#eef2ea':'var(--line)', '#f7faf4':'#f7f9fc'
}
function walk(dir) { return fs.readdirSync(dir, { withFileTypes:true }).flatMap(entry => entry.isDirectory() ? walk(path.join(dir,entry.name)) : [path.join(dir,entry.name)]) }
const touched = []
for (const file of [...walk(path.join(root,'pages')), ...walk(path.join(root,'components')), path.join(root,'styles/body.wxss')].filter(file => file.endsWith('.wxss'))) {
  let text = fs.readFileSync(file,'utf8')
  text = text.replace(/#[0-9a-f]{6}\b/gi, value => palette[value.toLowerCase()] || value)
    .replace(/rgba\(40,\s*116,\s*78,/g,'rgba(23, 32, 43,')
    .replace(/rgba\(37,\s*53,\s*44,/g,'rgba(23, 32, 43,')
    .replace(/cubic-bezier\(0\.34,\s*1(?:\.\d+)?,\s*0\.64,\s*1\)/g,'cubic-bezier(.2,.8,.2,1)')
    .replace(/border-radius:\s*(28|32|36)rpx/g,'border-radius: 20rpx')
  if (text !== fs.readFileSync(file,'utf8')) { fs.writeFileSync(file,text); touched.push(path.relative(root,file)) }
}
// Recolor source SVG data URLs without a runtime base64 dependency.
const iconsFile = path.join(root,'assets/navigation-icons.js')
let icons = fs.readFileSync(iconsFile,'utf8')
icons = icons.replace(/data:image\/svg\+xml;base64,([A-Za-z0-9+/=]+)/g, (all,base64) => 'data:image/svg+xml;base64,' + Buffer.from(Buffer.from(base64,'base64').toString('utf8').replace(/#5f7565/g,'#526071')).toString('base64'))
fs.writeFileSync(iconsFile, icons)
console.log(JSON.stringify({ updated_styles:touched.length, files:touched },null,2))
