const express = require('express');
const cors = require('cors');
const axios = require('axios');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());
const app = express();
app.use(cors());

const puppeteerArgs = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--no-first-run',
    '--no-zygote',
    '--single-process'
];

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
            await new Promise(resolve => setTimeout(resolve, 3000)); 
        }
    } catch (e) {
        console.error("Scraper Hatası:", e.message);
    } finally {
        if (browser) await browser.close();
    }
    return streamUrl;
}

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

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Sunucu 0.0.0.0:${PORT} üzerinde başarıyla hazır!`);
});
