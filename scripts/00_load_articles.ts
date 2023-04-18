import data from '../articles.json';
import * as fs from 'fs';


function main() {
  for (const article of data) {
    console.log(article)
    const fileName = `${article.slug}.md`
    const content = `
---
title: ${article.title}
date: ${new Date().toISOString()}
draft: true
---

${article.body_markdown}
    
    `
    fs.writeFileSync(`content/posts/${fileName}`, content)
  }
}

main()