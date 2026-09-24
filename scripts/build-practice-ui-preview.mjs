import { readFileSync, writeFileSync } from 'node:fs'
// Package the isolated prototype for offline review. No network or database access.
let html = readFileSync('public/finance-ui/index.html', 'utf8')
let css = readFileSync('public/finance-ui/style.css', 'utf8')
let js = readFileSync('public/finance-ui/app.js', 'utf8')
for (const name of ['practice-garden.webp', 'practice-patio.webp', 'practice-library.webp']) {
  const uri = 'data:image/webp;base64,' + readFileSync('public/illustrations/' + name).toString('base64')
  css = css.replaceAll('../illustrations/' + name, uri)
  js = js.replaceAll('../illustrations/' + name, uri)
}
html = html.replace('<link rel="stylesheet" href="./style.css">', '<style>' + css + '</style>')
  .replace('<script src="./app.js"></script>', () => '<script>' + js + '</script>')
writeFileSync('design-demo/finance-preview.html', html)
console.log('Updated standalone Consulting & Finance preview')
