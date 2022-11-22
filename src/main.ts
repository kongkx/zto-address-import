import puppeteer, { Browser } from 'puppeteer'
import * as fs from 'fs'
import * as path from 'path'
import { uniqBy } from 'lodash'

const INIT_URL = 'https://mabef.com/en'
const CACHE_DIR = 'cache'
const OUTPUT_DIR = 'feeds'

const PROXY = 'http://127.0.0.1:1087'

const CAT_PREFIX = 'cat-';
const PROD_PREFIX = 'p-';
const TAG_PREFIX = 'tag-';


async function fetchCategories(browser: Browser) {
  const page = await browser.newPage();
  await page.goto(INIT_URL, {
    waitUntil: 'networkidle2'
  });
  const categories = await page.evaluate(() => {
    return [...document.querySelectorAll('.node-content .awe-section-101-1 .awe-col-content')].map((d) => {
      const title = d.querySelector('h2.prodotti-home')?.textContent;
      const link = (d.querySelector('h2.prodotti-home a') as HTMLAnchorElement).href
      const name = link.split('/').reverse()[0];
      const cover = (d.querySelector('.awe-image-container img') as HTMLImageElement).src
      return {
        title,
        name,
        cover,
        link
      }
    })
  })
  categories.forEach((cat) => {
    const filename = path.resolve(CACHE_DIR, `${CAT_PREFIX}${cat.name}.json`);
    fs.writeFileSync(filename, JSON.stringify(cat, null, 2));
    console.log('written: %s', filename);
  })
  await page.close();
}

async function fetchCategoryPages(browser: Browser) {
  const files = fs.readdirSync(path.resolve(CACHE_DIR)).filter((str) => str.startsWith(CAT_PREFIX));
  const page = await browser.newPage();

  for (let i = 0; i < files.length; i += 1) {
    console.log('category page %d / %d', i + 1, files.length);
    const filename = path.resolve(CACHE_DIR, files[i]);
    const data = JSON.parse(fs.readFileSync(filename, 'utf-8'));
    await page.goto(data.link, { waitUntil: 'networkidle2' });
    const extraData = await page.evaluate(() => {
      const bannerDom = document.querySelector('.bg-overlay-wrapper');
      const banner = (bannerDom as HTMLDivElement).style.backgroundImage.replace(/url\("(.*?)"\)/, '$1');
      const cardLabelDom = document.querySelector('.titolo-prodotti');
      const cardLabel = getComputedStyle(cardLabelDom!).backgroundImage.replace(/url\("(.*?)"\)/, '$1')
      return {
        banner,
        cardLabel,
      }
    })
    fs.writeFileSync(filename, JSON.stringify({
      ...data,
      ...extraData,
    }, null, 2));
    console.log('category updated: %s', filename);
    const products = await page.evaluate(() => {
      return [...document.querySelectorAll('.view .col-xs-12')].map((d) => {
        const link = (d.querySelector('.titolo-prodotti a') as HTMLAnchorElement)?.href;
        const text = (d.querySelector('.titolo-prodotti a') as HTMLAnchorElement).innerText?.trim();
        const [title, label] = text!.split('\n');
        return {
          title,
          label,
          link,
          name: link.split('/').reverse()[0]
        }
      })
    })
    console.log('products count: %d', products.length);
    products.forEach((p) => {
      const filename = path.resolve(CACHE_DIR, `${PROD_PREFIX}${p.name}.json`);
      fs.writeFileSync(filename, JSON.stringify({
        ...p,
        category: data.name,
      }, null, 2));
      console.log('written: %s', filename);
    });
    console.log('================');
  }

  await page.close();
}

async function fetchCategoryProducts(browser: Browser) {
  const files = fs.readdirSync(path.resolve(CACHE_DIR)).filter((str) => str.startsWith(PROD_PREFIX));
  const page = await browser.newPage();
  for (let i = 0; i < files.length; i += 1) {
    const filename = path.resolve(CACHE_DIR, files[i]);
    const product = JSON.parse(fs.readFileSync(filename, 'utf-8'));
    await page.goto(product.link, { waitUntil: 'networkidle2' })
    const detail = await page.evaluate(() => {
      const title = (document.querySelector('h1.entry-title') as HTMLElement).innerText?.trim().split('\n').reverse()[0]
      const label = document.querySelector('.field-name-field-prodotti-titolo-tipo')?.textContent?.trim()
      const pivot = document.querySelector('.field-name-field-prodotti-titolo-tipo')
      const desc = pivot?.nextElementSibling?.tagName === 'P' ? pivot?.nextElementSibling.outerHTML : '';
      const cover = (document.querySelector('.field-name-field-prodotti-foto img') as HTMLImageElement).src;
      const gallery = [
        ...document.querySelectorAll('.field-name-field-prodotti-altre-foto .slides img')
      ].map((img) => (img as HTMLImageElement).src);

      const attachments = [
        ...document.querySelectorAll('.field-name-field-prodotti-download a')
      ].map((a) => ({
        label: a.textContent?.trim(),
        link: (a as HTMLAnchorElement).href,
      }))

      const weight = document.querySelector('.field-name-field-prodotti-peso .field-items')?.textContent?.trim()
      const capacity = document.querySelector('.field-name-field-prodotti-portata .field-items')?.textContent?.trim()

      const tags = [
        ...document.querySelectorAll('.field-name-field-prodotti-caratteristiche .taxonomy-term')
      ].map((d) => ({
        label: d.querySelector('.content')?.textContent?.trim(),
        icon: (d.querySelector('.content img') as HTMLImageElement)?.src
      }))

      const assembly_video = document.querySelector('iframe.youtube-field-player')?.getAttribute('src');
      const model_video = document.querySelector('.field-name-field-prodotti-video-3d iframe')?.getAttribute('src')

      let variations = [
        ...document.querySelectorAll('.field-name-field-prodotti-carat-altro .taxonomy-term')
      ].map((d) => {
        const text = d.querySelector('.content')?.textContent?.trim();
        const [sku, label] = text!.split(': ')
        return {
          sku,
          label
        }
      })
      if (variations.length === 0) {
        variations.push({
          label: 'default',
          sku: location.pathname.split('/').reverse()[0],
        })
      }

      return {
        title,
        label,
        cover,
        gallery,
        desc,
        attachments,
        weight,
        capacity,
        tags,
        assembly_video,
        model_video,
        variations,
      }
    })

    fs.writeFileSync(filename, JSON.stringify({
      ...product,
      ...detail,
    }));
    console.log('product updated: %s', filename);
  }
  await page.close();
}

async function fetchDownloable(browser: Browser) {
  const page = await browser.newPage();
  await page.goto(INIT_URL + '/download', { waitUntil: 'networkidle2' });
  const data = await page.evaluate(() => {
    return [
      ...document.querySelectorAll('.awe-col-content ')
    ].map((d) => {
      return {
        title: (d.querySelector('.minrosso a') as HTMLAnchorElement).textContent?.trim(),
        cover: (d.querySelector('.awe-image img') as HTMLImageElement).src,
        file: (d.querySelector('.minrosso a') as HTMLAnchorElement).href,
      }
    })
  })
  fs.writeFileSync(
    path.resolve(OUTPUT_DIR, 'downloadable.json'),
    JSON.stringify(data, null, 2)
  )
  await page.close();
}

async function fetchTestimonials(browser: Browser) {
  const page = await browser.newPage();
  await page.goto(INIT_URL, { waitUntil: 'networkidle2' });
  const data = await page.evaluate(() => {
    return [
      ...document.querySelectorAll('.awe-quote')
    ].map((d) => {
      return {
        content: d.querySelector('.quote-content .info-desc')?.textContent?.trim(),
        name: d.querySelector('.box-name')?.textContent?.trim(),
      }
    })
  })
  fs.writeFileSync(
    path.resolve(OUTPUT_DIR, 'testimonials.json'),
    JSON.stringify(data, null, 2)
  )
  await page.close();
}

async function constructData() {
  const pFiles = fs.readdirSync(path.resolve(CACHE_DIR)).filter((str) => str.startsWith(PROD_PREFIX));
  const products = pFiles.map((filename) => JSON.parse(fs.readFileSync(
    path.resolve(CACHE_DIR, filename), 'utf-8'
  )))
  fs.writeFileSync(
    path.resolve(OUTPUT_DIR, 'products.json'),
    JSON.stringify(products, null, 2)
  )

  const catFiles = fs.readdirSync(path.resolve(CACHE_DIR)).filter((str) => str.startsWith(CAT_PREFIX));
  const categories = catFiles.map((filename) => JSON.parse(fs.readFileSync(
    path.resolve(CACHE_DIR, filename), 'utf-8'
  )))
  fs.writeFileSync(
    path.resolve(OUTPUT_DIR, 'categories.json'),
    JSON.stringify(categories, null, 2)
  )

  const tags = uniqBy(products.map((p) => p.tags).flat(), 'label')
  fs.writeFileSync(
    path.resolve(OUTPUT_DIR, 'tags.json'),
    JSON.stringify(tags, null, 2)
  )

}

async function main() {
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      `--proxy-server=${PROXY}`
    ]
  })

  await fetchCategories(browser);
  await fetchCategoryPages(browser);
  await fetchCategoryProducts(browser);
  await fetchDownloable(browser);
  await fetchTestimonials(browser);

  constructData();

  await browser.close();

}

main();