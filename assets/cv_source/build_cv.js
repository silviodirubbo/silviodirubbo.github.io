// Renders cv.html to ../Resume.pdf with the preinstalled Chromium, then checks that each page fits.
const path = require('path');
const { chromium } = require('playwright');

(async () => {
  const src = 'file://' + path.join(__dirname, 'cv.html');
  const out = path.join(__dirname, '..', 'Resume.pdf');
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(src, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  const overflow = await page.evaluate(() => [...document.querySelectorAll('.page')].map((pg, i) => {
    const footer = pg.querySelector('.page-footer').getBoundingClientRect().top;
    const last = [...pg.querySelectorAll('.section')].pop().getBoundingClientRect().bottom;
    return { page: i + 1, spaceAboveFooterPx: Math.round(footer - last) };
  }));
  console.log(JSON.stringify(overflow));
  if (overflow.some(o => o.spaceAboveFooterPx < 12)) { console.error('Content runs into the footer'); process.exit(1); }
  await page.pdf({ path: out, preferCSSPageSize: true, printBackground: true });
  await browser.close();
  console.log('Wrote ' + out);
})();
