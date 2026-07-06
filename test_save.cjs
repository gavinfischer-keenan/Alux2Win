const { chromium } = require('C:/Users/gavin/OneDrive/Documents/GitHub/Alux2Win/node_modules/playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
  page.on('pageerror', err => console.log('BROWSER ERROR:', err.message));
  
  await page.goto('http://localhost:3000/');
  await page.waitForTimeout(1000);
  
  console.log('Clicking EDITOR...');
  const editorBtn = await page.getByText('?? EDITOR');
  await editorBtn.click();
  await page.waitForTimeout(1000);
  
  console.log('Clicking Save Level...');
  const saveBtn = await page.locator('button[title="Save Level"]');
  await saveBtn.click();
  await page.waitForTimeout(1000);
  
  console.log('Checking for overlay...');
  const saveSourceBtn = await page.getByText('Save to Source Code');
  if (await saveSourceBtn.isVisible()) {
    console.log('Overlay is visible. Clicking Save to Source Code...');
    page.on('dialog', async dialog => {
      console.log('ALERT:', dialog.message());
      await dialog.accept();
    });
    await saveSourceBtn.click();
    await page.waitForTimeout(1000);
  } else {
    console.log('Overlay NOT visible.');
  }
  
  await browser.close();
})();
