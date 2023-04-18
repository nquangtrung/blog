import * as fs from 'fs';
import axios from 'axios';

const urls: string[] = [
  'https://dev-to-uploads.s3.amazonaws.com/uploads/articles/mywsxgwreyhe2gk77t6p.jpg',
  'https://dev-to-uploads.s3.amazonaws.com/uploads/articles/cn7lf6ugwwxy7r6nz0va.jpg',
  'https://dev-to-uploads.s3.amazonaws.com/uploads/articles/d58t9qe39mrn6ywaoaxk.jpg',
  'https://dev-to-uploads.s3.amazonaws.com/uploads/articles/ykpup03ygalu2nxkzkdp.jpg',
  'https://dev-to-uploads.s3.amazonaws.com/uploads/articles/i5bjdhu8r0037v0n4uz2.jpg',
  'https://dev-to-uploads.s3.amazonaws.com/uploads/articles/orw7plhrgd3ptjd5ukns.jpg',
  'https://dev-to-uploads.s3.amazonaws.com/uploads/articles/wyak2up8126wdshos584.jpg',
  'https://dev-to-uploads.s3.amazonaws.com/uploads/articles/w9u0vxzx4lnbdo7dqyp2.jpg',
  'https://dev-to-uploads.s3.amazonaws.com/uploads/articles/s00qjqd6czl70ypnkgfw.jpg',
  'https://dev-to-uploads.s3.amazonaws.com/uploads/articles/are3m3crc8kup5qvfqjo.jpg',
  'https://dev-to-uploads.s3.amazonaws.com/uploads/articles/wf1dimpteol8vko0o1jp.jpg',
  'https://dev-to-uploads.s3.amazonaws.com/uploads/articles/xuna39ybozjqvsj7gzdj.jpg',
];

async function main() {
  for (const url of urls) {
    const urlObj = new URL(url);

    const response = await axios.get(url, { responseType: 'stream' })
    response.data.pipe(fs.createWriteStream('images/' + urlObj.pathname.split('/').pop()))

    await new Promise<void>((resolve, reject) => {
      response.data.on('end', () => {
        console.log('downloaded', url)
        resolve()
      })

      response.data.on('error', () => {
        reject()
      })
    })
  }
}

main()