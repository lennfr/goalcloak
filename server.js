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

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/game', async (req, res) => {
  try {
    console.log(`Fetching ${TARGET_URL}...`);
    const html = await fetchResource(TARGET_URL);
    
    if (!html) {
      return res.status(500).send('Failed to fetch target website');
    }
    
    console.log('Processing HTML...');
    const processedHtml = await processHtml(html, TARGET_URL);
    
    console.log('Sending processed HTML');
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
