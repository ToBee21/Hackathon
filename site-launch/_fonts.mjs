import { writeFileSync, mkdirSync } from 'node:fs'
const UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'
const url='https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Hanken+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@500;600&display=swap'
const css=await (await fetch(url,{headers:{'User-Agent':UA}})).text()
mkdirSync('privacymyst/assets/fonts',{recursive:true})
const uniq=[...new Set([...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+\.woff2)\)/g)].map(m=>m[1]))]
let out=css, i=0
for(const u of uniq){ i++; const name='f'+i+'.woff2'
  const buf=Buffer.from(await (await fetch(u,{headers:{'User-Agent':UA}})).arrayBuffer())
  writeFileSync('privacymyst/assets/fonts/'+name,buf)
  out=out.split(u).join('assets/fonts/'+name) }
writeFileSync('privacymyst/fonts.css','/* Self-hosted: zero external font requests */\n'+out)
console.log('downloaded',i,'woff2; fonts.css written; any gstatic left?', /gstatic/.test(out))
