const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());
const app = express();
app.use(cors());

// Render'da Puppeteer'ın çalışabilmesi için özel argümanlar
const puppeteerArgs = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu'
];

async function scrapeHdFilmCehennemi(searchQuery) {
    // Render üzerinde varsayılan Chrome yolunu bulması için env kontrolü
    const browser = await puppeteer.launch({
        headless: true,
        args: puppeteerArgs,
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || null
    });

    const page = await browser.newPage();
    let streamUrl = null;

    try {
        await page.setRequestInterception(true);
        page.on('request', req => {
            const url = req.url();
            if (url.includes('master.m3u8') && url.includes('rapidrame')) {
                streamUrl = url;
            }
            req.continue();
        });

        // Güncel aktif alan adı .land oldu
        const searchUrl = `https://hdfilmcehennemi.land{encodeURIComponent(searchQuery)}`;
        await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 20000 });

        const firstResult = await page.$('.poster a'); 
        if (firstResult) {
            await Promise.all([
                page.click('.poster a'),
                page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 })
            ]);
            await new Promise(resolve => setTimeout(resolve, 4000)); // Linki yakalamak için bekle
        }
    } catch (e) {
        console.error("Hata:", e.message);
    } finally {
        await browser.close();
    }
    return streamUrl;
}

// Nuvio için Stream Endpoint'i
app.get('/stream/:query.json', async (req, res) => {
    const { query } = req.params;
    console.log(`Aranan: ${query}`);
    
    const videoUrl = await scrapeHdFilmCehennemi(query);

    if (videoUrl) {
        res.json({
            streams: [{
                name: "🎬 HFC - Rapidrame",
                title: `${query} [1080p Stream]`,
                url: videoUrl
            }]
        });
    } else {
        res.json({ streams: [], message: "Kaynak bulunamadı." });
    }
});

// Render portu otomatik atar, localde 3000 çalışır
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Sunucu ${PORT} portunda ayaklandı.`));
