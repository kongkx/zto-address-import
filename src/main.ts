import puppeteer, { Browser, Page } from 'puppeteer'
import * as fs from 'fs'
import * as path from 'path'
import { uniqBy } from 'lodash'
import { delay } from './utils'

const INIT_URL = 'https://my.zto.com/my-address'

const COOKIE_PATH = './cookies.json';
const DATA_PATH = './data.json';

const getAddressText = (data: any) => `${data.name}, ${data.phone}, ${data.region} ${data.address}`;

async function addAddress(page: Page, data: any) {
  const address = getAddressText(data);
  await page.click('.address-a-btn');
  await page.type('.edit-address-dialog .auto-ansysic textarea', address)
  await page.click('.edit-address-dialog .auto-ansysic span');
  await page.click('.edit-address-dialog .el-select')

  if (data.post) {
    await page.evaluate(() => {
      (document.querySelector('.el-select-dropdown .el-select-dropdown__item') as HTMLDivElement)?.click();
    })
  } else {
    await page.evaluate(() => {
      ((document.querySelector('.el-select-dropdown .el-select-dropdown__item') as HTMLDivElement).nextElementSibling as HTMLDivElement)?.click();
    })
  }

  await delay(1000);
  await page.click('.edit-address-dialog .e-edit-btn')
  await delay(1000);

  await page.evaluate(() => {
    const btn = document.querySelector('.edit-address-dialog .close-btn');
    if (btn) {
      (btn as HTMLDivElement).click();
    }

  })
  await delay(1000);
}

async function main() {
  const browser = await puppeteer.launch({
    headless: false,
    args: [`--window-size=1280,1080`],
    defaultViewport: {
      width: 1280,
      height: 1080
    }
  })

  const page = await browser.newPage();
  if (fs.existsSync(COOKIE_PATH)) {
    await page.setCookie(...JSON.parse(fs.readFileSync(COOKIE_PATH, 'utf-8')));
  }

  await page.goto(INIT_URL, {
    waitUntil: 'networkidle2',
  });

  const location = page.url()
  if (location !== INIT_URL) {
    page.on("framenavigated", async frame => {
      const url = frame.url(); // the new url
      console.log(url);
      // do something here...
      if (url === 'https://my.zto.com/my-address') {
        const cookies = await page.cookies();
        fs.writeFileSync('./cookies.json', JSON.stringify(cookies, null, 2));
        await browser.close();
      }
    });

  } else {
    const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'));
    const uData = uniqBy(data, getAddressText).reverse();
    // console.log(data.length, uData.length);

    // while (true) {
    //   await page.click('.el-table__row .handle-btn:nth-child(2)');
    //   await delay(500);
    //   await page.click('.el-message-box__btns .el-button--primary')
    //   await delay(1000);
    // }

    let length = uData.length;
    // const length = 0;
    for (let i = 0; i < length; i += 1) {
      const data = uData[i];
      console.log(i, data);
      await addAddress(page, uData[i]);
    }
    await browser.close();
  }

}

main();