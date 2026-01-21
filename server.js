const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const { URL } = require('url');
const path = require('path');

const app = express();
const PORT = 3000;
const TARGET_URL = 'https://rocketgoal.io/';

const cache = new Map();

async function fetchResource(url) {
  if (cache.has(url)) {
    return cache.get(url);
  }
  
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      responseType: 'text',
      timeout: 10000
    });
    cache.set(url, response.data);
    return response.data;
  } catch (error) {
    console.error(`Error fetching ${url}:`, error.message);
    return null;
  }
}

function isInternalUrl(url, baseUrl) {
  try {
    const urlObj = new URL(url, baseUrl);
    const baseObj = new URL(baseUrl);
    return urlObj.hostname === baseObj.hostname;
  } catch {
    return false;
  }
}

function resolveUrl(url, baseUrl) {
  try {
    return new URL(url, baseUrl).href;
  } catch {
    return null;
  }
}

async function inlineScripts($, baseUrl) {
  const scripts = $('script[src]');
  
  for (let i = 0; i < scripts.length; i++) {
    const script = $(scripts[i]);
    const src = script.attr('src');
    const resolvedUrl = resolveUrl(src, baseUrl);
    
    if (resolvedUrl && isInternalUrl(resolvedUrl, baseUrl)) {
      console.log(`Inlining script: ${resolvedUrl}`);
      const content = await fetchResource(resolvedUrl);
      
      if (content) {
        script.removeAttr('src');
        script.text(content);
      }
    }
  }
}

async function processHtml(html, baseUrl) {
  const $ = cheerio.load(html);
  
  if (!$('base').length) {
    $('head').prepend(`<base href="${baseUrl}">`);
  }
  
  await inlineScripts($, baseUrl);
  
  return $.html();
}


app.get('/', (req, res) => {
  res.send(`
  
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Tab</title>
  <style>
    body {
      margin: 0;
      height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #000;
      font-family: Arial, sans-serif;
    }

    .open-text {
      font-size: 4rem;
      font-weight: 700;
      cursor: pointer;
      user-select: none;
      text-align: center;
    }

    .open-text:hover {
      opacity: 0.8;
    }
  </style>
</head>
<body>

  <div class="open-text" onclick="cloak('/game', 'https://google.com');">
    click to open game
  </div>

    <script>
    const cloak = function(url, redirect) {
  try {
    const newWindow = window.open('about:blank', '_blank');
    if (newWindow) {
      newWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>New Tab</title>
            <style>
              body { margin: 0; padding: 0; overflow: hidden; }
              iframe { border: none; width: 100vw; height: 100vh; }
            </style>
          </head>
          <body>
            <iframe src="${url}"></iframe>
          </body>
        </html>
      `);
      newWindow.document.close();
    } else {
      window.location.href = url;
    }
    if (redirect) {
      window.onbeforeunload = null;
      window.location.replace(redirect);
    }
  } catch (error) {
    console.error('Cloak error:', error);
    window.location.href = url;
  }
};
        </script>

</body>
</html>
  `);
});

app.get('/game', async (req, res) => {
  try {
    console.log(`Fetching ${TARGET_URL}...`);
    const html = await fetchResource(TARGET_URL);
    
    if (!html) {
      return res.status(500).send('Failed to fetch website');
    }
    
    console.log('Processing...');
    const processedHtml = await processHtml(html, TARGET_URL);
    
    console.log('Sending HTML');
    res.setHeader('Content-Type', 'text/html');
    res.send(processedHtml);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).send('An error occurred: ' + error.message);
  }
});

app.get('/clear-cache', (req, res) => {
  cache.clear();
  res.send('Cache cleared');
});

app.listen(PORT, () => {
  console.log(`Mirror server running at http://localhost:${PORT}`);
});
