import express from 'express';
import axios from 'axios';
import dns from 'node:dns/promises';
import { Address4, Address6 } from 'ip-address';
import { analyzeNovel, fetchChaptersBatch } from './services/crawler.js';
import { getIO } from './socket.js';

export const router = express.Router();

// Allow internal IPs if explicitly configured (e.g. in K8s/Docker)
const ALLOW_INTERNAL_IPS = process.env.ALLOW_INTERNAL_IPS === 'true';

/**
 * Validates an IP address against private/reserved ranges.
 * @param {string} ip - The IP address string.
 * @returns {boolean} - True if public/safe, false if private/reserved.
 */
function isIpSafe(ip) {
  // Bypass validation if configured for internal/dev environments
  if (ALLOW_INTERNAL_IPS) return true;

  try {
    if (Address4.isValid(ip)) {
      const addr = new Address4(ip);
      const parts = addr.parsedAddress.map(p => parseInt(p, 10));
      const [p0, p1, p2] = parts;

      // 0.0.0.0/8 (Current network)
      if (p0 === 0) return false;
      
      // 10.0.0.0/8 (Private)
      if (p0 === 10) return false;
      
      // 100.64.0.0/10 (CGNAT)
      if (p0 === 100 && p1 >= 64 && p1 <= 127) return false;
      
      // 127.0.0.0/8 (Loopback)
      if (p0 === 127) return false;
      
      // 169.254.0.0/16 (Link-local)
      if (p0 === 169 && p1 === 254) return false;
      
      // 172.16.0.0/12 (Private)
      if (p0 === 172 && p1 >= 16 && p1 <= 31) return false;
      
      // 192.0.2.0/24 (TEST-NET-1)
      if (p0 === 192 && p1 === 0 && p2 === 2) return false;
      
      // 192.168.0.0/16 (Private)
      if (p0 === 192 && p1 === 168) return false;
      
      // 198.18.0.0/15 (Benchmarking)
      if (p0 === 198 && (p1 === 18 || p1 === 19)) return false;
      
      // 198.51.100.0/24 (TEST-NET-2)
      if (p0 === 198 && p1 === 51 && p2 === 100) return false;
      
      // 203.0.113.0/24 (TEST-NET-3)
      if (p0 === 203 && p1 === 0 && p2 === 113) return false;
      
      // 224.0.0.0/4 (Multicast/Reserved)
      if (p0 >= 224) return false;

      return true;
    }
    
    if (Address6.isValid(ip)) {
       const addr = new Address6(ip);
       if (addr.isLoopback()) return false;
       if (addr.isUniqueLocal()) return false;
       if (addr.isLinkLocal()) return false;
       if (addr.isMulticast()) return false;
       
       // Block documentation ranges (2001:db8::/32)
       const hex = addr.toHex(); 
       if (hex.startsWith('2001:0db8')) return false;
       
       return true;
    }
    return false;
  } catch (e) {
    // Fail safe on parsing errors
    return false;
  }
}

/**
 * Resolves a hostname to an IP and validates it.
 * Returns the safe IP and family, or throws error.
 */
async function resolveAndValidate(hostname) {
  const { address, family } = await dns.lookup(hostname);
  if (!isIpSafe(address)) {
    throw new Error(`DNS resolution denied: ${hostname} resolved to private/unsafe IP ${address}`);
  }
  return { address, family };
}

// Step 1: Analyze the main URL (TOC)
router.post('/novel-info', async (req, res) => {
  const { url, jobId } = req.body;
  try {
    if (!url) return res.status(400).json({ error: 'URL is required' });
    if (!jobId) return res.status(400).json({ error: 'jobId is required for session tracking' });
    
    // Basic URL validation
    try { new URL(url); } catch(e) { return res.status(400).json({ error: 'Invalid URL' }); }

    // Analyze in background
    analyzeNovel(url, jobId).catch(err => {
       console.error('Background analysis failed:', err);
       getIO().to(jobId).emit('error', { message: err.message || 'Analysis crashed' });
    });

    res.json({ 
      status: 'queued',
      message: 'Analysis started. Please wait for socket events.' 
    });
  } catch (error) {
    console.error('Error in /novel-info:', error);
    if (jobId) getIO().to(jobId).emit('error', { message: error.message });
    res.status(500).json({ error: 'Failed to start analysis', details: error.message });
  }
});

// Step 2: Fetch content for a batch of chapters
router.post('/chapters-batch', async (req, res) => {
  try {
    const { chapters, jobId, userAgent } = req.body;
    if (!chapters || !Array.isArray(chapters)) {
      return res.status(400).json({ error: 'chapters array is required' });
    }

    const results = await fetchChaptersBatch(chapters, jobId, userAgent);
    res.json({ results });
  } catch (error) {
    console.error('Error in /chapters-batch:', error);
    res.status(500).json({ error: 'Failed to fetch batch', details: error.message });
  }
});

// Helper: Proxy images safely (Preventing SSRF via DNS Rebinding & Redirects)
router.get('/proxy-image', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).send('URL required');
  
  let currentUrl = url;
  let redirectCount = 0;
  const MAX_REDIRECTS = 5;
  const MAX_SIZE = 10 * 1024 * 1024; // 10MB limit

  try {
    while (redirectCount <= MAX_REDIRECTS) {
      let urlObj;
      try {
        urlObj = new URL(currentUrl);
      } catch (e) {
        return res.status(400).send('Invalid URL format');
      }

      if (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') {
        return res.status(400).send('Invalid protocol');
      }

      // 1. Resolve and Validate IP immediately
      const { address, family } = await resolveAndValidate(urlObj.hostname);

      // 2. Define custom lookup to force Axios to use the VALIDATED IP
      // This prevents DNS Rebinding because we intercept the lookup and return the pinned safe IP.
      const customLookup = (hostname, options, cb) => {
        // Axios/Node passes (hostname, options, callback)
        // We bypass actual DNS lookup here and return our pre-validated IP
        cb(null, address, family);
      };

      // 3. Perform Request with Redirects DISABLED (Manual handling)
      try {
        const response = await axios.get(currentUrl, {
          responseType: 'arraybuffer',
          timeout: 10000,
          headers: { 'User-Agent': 'Mozilla/5.0' },
          maxRedirects: 0,
          lookup: customLookup, // Force usage of safe IP
          maxContentLength: MAX_SIZE,
          maxBodyLength: MAX_SIZE,
          validateStatus: status => (status >= 200 && status < 300) || (status >= 300 && status < 400)
        });

        // Handle Redirects Manually
        if (response.status >= 300 && response.status < 400) {
          const location = response.headers['location'];
          if (!location) throw new Error('Redirect without location header');
          
          // Resolve relative redirects
          currentUrl = new URL(location, currentUrl).href;
          redirectCount++;
          continue;
        }

        // Success
        const contentType = response.headers['content-type'] || 'image/jpeg';
        res.set('Content-Type', contentType);
        return res.send(response.data);

      } catch (err) {
        // Axios throws on maxRedirects: 0 if it hits a redirect that validateStatus doesn't catch
        // But since we catch 3xx in validateStatus, this catch handles network/timeout errors.
        throw err;
      }
    }
    
    throw new Error('Too many redirects');

  } catch (error) {
    // Differentiate errors
    if (error.message && error.message.includes('DNS resolution denied')) {
        console.warn(`Proxy blocked unsafe IP for ${url}: ${error.message}`);
        return res.status(403).send('Access to this resource is forbidden');
    }
    if (error.code === 'ERR_BAD_RESPONSE' || error.message.includes('maxContentLength')) {
        console.warn(`Proxy blocked large image for ${url}`);
        return res.status(413).send('Image too large');
    }
    
    console.warn(`Proxy blocked/failed for ${url}:`, error.message);
    res.status(500).send('Failed to fetch image');
  }
});