const express = require('express');
const cors = require('cors');
const axios = require('axios');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());
const app = express();
app.use(cors());

// Render üzerinde Puppeteer'ın kararlı çalışması için argümanlar
const puppeteerArgs = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu'
];

// -------------------------------------------------------------------------
// STREMIO / NUVIO MANIFEST (Eklentiyi uygulamaya tanıtan kısım)
// -------------------------------------------------------------------------
const manifest = {
    id: "org.kanka.httpaddon",
    version: "1.0.0",
    name: "Kankas HTTP Multi-Stream",
    description: "Hdfilmcehennemi ve diğer sitelerden HTTP akışı sağlar.",
    resources: ["stream"],
    types: ["movie", "series"],
    idPrefixes: ["tt"] // IMDb ID'lerini yakalamak için
};

// Ana sayfa isteği manifest dosyasına yönlendirilsin
app.get('/', (req, res) => res.redirect('/manifest.json'));
app.get('/manifest.json', (req, res) => res.json(manifest));

// -------------------------------------------------------------------------
// YARDIMCI FONKSİYON: IMDb ID'sini Film Adına Çevirme (Cinemeta API)
// -------------------------------------------------------------------------
async function getMovieNameFromImdb(imdbId) {
    try {
        // Stremio'nun resmi katalog servisinden filmin adını çekiyoruz
        const response = await axios.get(`https://strem.io{imdbId}.json`);
        if (response.data && response.data.meta) {
            return response.data.meta.name; // Örn: "Spider-Man: Brand New Day"
        }
    } catch (e) {
        console.error("IMDb ID isim çevrim hatası:", e.message);
    }
    return null;
}

// -------------------------------------------------------------------------
// SCRAPER: Hdfilmcehennemi'nden Link Yakalama Fonksiyonu
// -------------------------------------------------------------------------
async function scrapeHdFilmCehennemi(searchQuery) {
    const browser = await puppeteer.launch({
        headless: true,
        args: puppeteerArgs,
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || null
    });

    const page = await browser.newPage();
    let streamUrl = null;

    try {
        // Ağ trafiğini dinlemeyi açıyoruz
        await page.setRequestInterception(true);
        page.on('request', req => {
            const url = req.url();
            // Eğer rapidrame üzerinden master.m3u8 akışı geçiyorsa yakala
            if (url.includes('master.m3u8') && url.includes('rapidrame')) {
                streamUrl = url;
            }
            req.continue();
        });

        // Güncel aktif site adresini buraya yazdık
        const searchUrl = `https://hdfilmcehennemi.land{encodeURIComponent(searchQuery)}`;
        await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 20000 });

        // Arama sonucundaki ilk filmin afiş linkini bul
        const firstResult = await page.$('.poster a'); 
        if (firstResult) {
            // Filme tıkla ve sayfanın tamamen yüklenmesini bekle
            await Promise.all([
                page.click('.poster a'),
                page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 })
            ]);
            // Oynatıcının (Rapidrame) yüklenip m3u8 linkini tetiklemesi için 4 saniye bekle
            await new Promise(resolve => setTimeout(resolve, 4000)); 
        }
    } catch (e) {
        console.error("Scraper Hatası:", e.message);
    } finally {
        await browser.close();
    }
    return streamUrl;
}

// -------------------------------------------------------------------------
// STREMIO STREAM ENDPOINT (Uygulamanın film linklerini istediği ana kapı)
// -------------------------------------------------------------------------
app.get('/stream/:type/:id.json', async (req, res) => {
    const { id } = req.params; // Stremio buradan "tt10872600" gibi ID gönderir
    console.log(`Gelen İstek IMDb ID: ${id}`);

    // 1. Aşama: ID'yi temiz sinema adına çevir
    const movieName = await getMovieNameFromImdb(id);
    if (!movieName) {
        return res.json({ streams: [], message: "Film adı bulunamadı." });
    }
    
    console.log(`Aranan Film Adı: ${movieName}`);

    // 2. Aşama: Hdfilmcehennemi sitesinde bu isimle tarama başlat
    const videoUrl = await scrapeHdFilmCehennemi(movieName);

    // 3. Aşama: Link bulunduysa Stremio oynatıcısına teslim et
    if (videoUrl) {
        res.json({
            streams: [{
                name: "🎬 HFC - Rapidrame",
                title: `${movieName}\n[1080p Stream - Dublaj/Altyazılı]`,
                url: videoUrl
            }]
        });
    } else {
        res.json({ streams: [] });
    }
});

// Render veya Local port yönetimi
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Eklenti ${PORT} portunda başarıyla çalışıyor.`));
