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
    description: "Hdfilmcehennemi ve FilmGecesi üzerinden HTTP akışı sağlar.",
    resources: ["stream"],
    types: ["movie", "series"],
    idPrefixes: ["tt"]
};

app.get('/', (req, res) => res.redirect('/manifest.json'));
app.get('/manifest.json', (req, res) => res.json(manifest));

// Hem Türkçe hem İngilizce isimleri çekebilmek için Cinemeta API'yi geliştiriyoruz
async function getMovieNamesFromImdb(imdbId) {
    try {
        const response = await axios.get(`https://strem.io{imdbId}.json`, { timeout: 4000 });
        if (response.data && response.data.meta) {
            const meta = response.data.meta;
            // Temiz arama için film isimlerini dizi olarak dönüyoruz
            return {
                enName: meta.name,
                trName: meta.locale && meta.locale.tr ? meta.locale.tr.name : meta.name
            };
        }
    } catch (e) {
        console.error("IMDb Çevrim Hatası:", e.message);
    }
    return null;
}

// 1. KAYNAK: HDFILMCEHENNEMI SCRAPER
async function scrapeHdFilmCehennemi(names, browser) {
    let streamUrl = null;
    const page = await browser.newPage();
    
    try {
        await page.setRequestInterception(true);
        page.on('request', req => {
            const type = req.resourceType();
            const url = req.url();
            if (url.includes('master.m3u8') && url.includes('rapidrame')) {
                streamUrl = url;
            }
            if (type === 'image' || type === 'font' || type === 'stylesheet') req.abort();
            else req.continue();
        });

        // Önce Türkçe ismi, yoksa İngilizce ismi dene
        const searchQuery = names.trName || names.enName;
        const searchUrl = `https://hdfilmcehennemi.land{encodeURIComponent(searchQuery)}`;
        
        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 12000 });

        const firstResult = await page.$('.poster a'); 
        if (firstResult) {
            await Promise.all([
                page.click('.poster a'),
                page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 12000 })
            ]);
            // Render yavaşlığı için bekleme süresini 5 saniyeye çıkardık
            await new Promise(resolve => setTimeout(resolve, 5000)); 
        }
    } catch (e) {
        console.error("HFC Scraper Hatası:", e.message);
    } finally {
        await page.close();
    }
    return streamUrl ? { name: "🎬 HFC - Rapidrame", title: `Rapidrame [1080p Stream]`, url: streamUrl } : null;
}

// 2. KAYNAK: FILMGECESI SCRAPER
async function scrapeFilmGecesi(names, browser) {
    let streamUrl = null;
    const page = await browser.newPage();
    
    try {
        await page.setRequestInterception(true);
        page.on('request', req => {
            const url = req.url();
            if (url.includes('master.m3u8') && url.includes('rapidrame')) {
                streamUrl = url;
            }
            req.continue();
        });

        const searchQuery = names.trName || names.enName;
        const searchUrl = `https://filmgecesi.vip{encodeURIComponent(searchQuery)}`;
        
        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 12000 });

        // FilmGecesi sitelerindeki genel film linki seçicisi (a etiketlerini tarar)
        const firstResult = await page.$('.film-content a, .poster a, a[href*="/film/"]');
        if (firstResult) {
            await Promise.all([
                firstResult.click(),
                page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 12000 })
            ]);
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    } catch (e) {
        console.error("FilmGecesi Scraper Hatası:", e.message);
    } finally {
        await page.close();
    }
    return streamUrl ? { name: "🎥 FilmGecesi - VIP", title: `Rapidrame [HQ Stream]`, url: streamUrl } : null;
}

// MAIN STREAM ENDPOINT
app.get('/stream/:type/:id.json', async (req, res) => {
    const { id } = req.params;
    console.log(`Gelen ID: ${id}`);

    const names = await getMovieNamesFromImdb(id);
    if (!names) return res.json({ streams: [] });
    
    console.log(`Aranan İsimler -> TR: ${names.trName} | EN: ${names.enName}`);

    const browser = await puppeteer.launch({
        headless: true,
        args: puppeteerArgs,
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome'
    });

    // İki siteyi aynı anda paralel tarıyoruz
    const scraperPromises = [
        scrapeHdFilmCehennemi(names, browser),
        scrapeFilmGecesi(names, browser)
    ];

    const results = await Promise.allSettled(scraperPromises);
    await browser.close();

    const activeStreams = results
        .filter(res => res.status === 'fulfilled' && res.value !== null)
        .map(res => res.value);

    res.json({ streams: activeStreams });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => console.log(`Eklenti hazır!`));
