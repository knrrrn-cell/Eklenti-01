const express = require('express');
const cors = require('cors');
const axios = require('axios');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());
const app = express();
app.use(cors());

// Render üzerinde Puppeteer'ın çökmeden, stabil çalışması için optimize argümanlar
const puppeteerArgs = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--no-first-run',
    '--no-zygote',
    '--single-process'
];

// -------------------------------------------------------------------------
// STREMIO / NUVIO MANIFEST
// -------------------------------------------------------------------------
const manifest = {
    id: "org.kanka.httpaddon",
    version: "1.0.0",
    name: "Kankas HTTP Multi-Stream",
    description: "Hdfilmcehennemi ve diğer sitelerden HTTP akışı sağlar.",
    resources: ["stream"],
    types: ["movie", "series"],
    idPrefixes: ["tt"]
};

app.get('/', (req, res) => res.redirect('/manifest.json'));
app.get('/manifest.json', (req, res) => res.json(manifest));

// -------------------------------------------------------------------------
// IMDb ID -> Film Adı Çevirici
// -------------------------------------------------------------------------
async function getMovieNameFromImdb(imdbId) {
    try {
        const response = await axios.get(`https://strem.io{imdbId}.json`, { timeout: 5000 });
        if (response.data && response.data.meta) {
            return response.data.meta.name;
        }
    } catch (e) {
        console.error("IMDb Çevrim Hatası:", e.message);
    }
    return null;
}

// -------------------------------------------------------------------------
// SCRAPER: Hdfilmcehennemi
// -------------------------------------------------------------------------
async function scrapeHdFilmCehennemi(searchQuery) {
    let browser;
    let streamUrl = null;

    try {
        browser = await puppeteer.launch({
            headless: true,
            args: puppeteerArgs,
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome'
        });

        const page = await browser.newPage();
        
        // Sayfa yüklenme hızını artırmak için resimleri ve gereksiz fontları engelliyoruz
        await page.setRequestInterception(true);
        page.on('request', req => {
            const type = req.resourceType();
            const url = req.url();
            
            if (url.includes('master.m3u8') && url.includes('rapidrame')) {
                streamUrl = url;
            }
            
            if (type === 'image' || type === 'font' || type === 'stylesheet') {
                req.abort();
            } else {
                req.continue();
            }
        });

        const searchUrl = `https://hdfilmcehennemi.land{encodeURIComponent(searchQuery)}`;
        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });

        const firstResult = await page.$('.poster a'); 
        if (firstResult) {
            await Promise.all([
                page.click('.poster a'),
                page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 })
            ]);
            // Linkin ağ trafiğine düşmesi için kısa bir bekleme
            await new Promise(resolve => setTimeout(resolve, 3000)); 
        }
    } catch (e) {
        console.error("Scraper Hatası:", e.message);
    } finally {
        if (browser) await browser.close();
    }
    return streamUrl;
}

// -------------------------------------------------------------------------
// STREAM ENDPOINT
// -------------------------------------------------------------------------
app.get('/stream/:type/:id.json', async (req, res) => {
    const { id } = req.params;
    console.log(`Gelen İstek ID: ${id}`);

    const movieName = await getMovieNameFromImdb(id);
    if (!movieName) {
        return res.json({ streams: [] });
    }
    
    console.log(`Aranan Film: ${movieName}`);
    const videoUrl = await scrapeHdFilmCehennemi(movieName);

    if (videoUrl) {
        res.json({
            streams: [{
                name: "🎬 HFC - Rapidrame",
                title: `${movieName}\n[1080p Stream]`,
                url: videoUrl
            }]
        });
    } else {
        res.json({ streams: [] });
    }
});

// -------------------------------------------------------------------------
// CRITICAL RENDER PORT BINDING (Render için hayati olan kısım)
// -------------------------------------------------------------------------
const PORT = process.env.PORT || 10000; // Render varsayılan olarak 10000 kullanır
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Sunucu 0.0.0.0:${PORT} üzerinde başarıyla hazır!`);
});
```

### 📦 İkinci Önemli Adım: `package.json` Güncellemesi

Render'ın kütüphaneleri yüklerken şişmesini engellemek için `package.json` dosyasını da hafifletmemiz gerekiyor. `package.json` dosyanın içeriğini de tamamen silip şununla değiştir kanka:

```json
{
  "name": "nuvio-eklenti",
  "version": "1.0.0",
  "description": "Nuvio HTTP Multi-Scraper Addon",
  "main": "index.js",
  "scripts": {
    "start": "node index.js"
  },
  "dependencies": {
    "axios": "^1.6.8",
    "cors": "^2.8.5",
    "express": "^4.19.2",
    "puppeteer-core": "^22.6.0",
    "puppeteer-extra": "^3.3.6",
    "puppeteer-extra-plugin-stealth": "^2.11.2"
  }
}
```
