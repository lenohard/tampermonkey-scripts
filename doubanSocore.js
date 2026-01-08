// ==UserScript==
// @name        douban-imdb
// @namespace   http://tampermonkey.net/
// @version     0.3
// @description show imdb/rt/metacritic scores and links
// @match       *://movie.douban.com/subject/*
// @grant       GM_xmlhttpRequest
// @grant       GM_getValue
// @grant       GM_setValue
// @grant       GM_registerMenuCommand
// @connect     omdbapi.com
// @connect     www.omdbapi.com
// @updateURL   https://raw.githubusercontent.com/lenohard/tampermonkey-scripts/main/doubanSocore.js
// @downloadURL https://raw.githubusercontent.com/lenohard/tampermonkey-scripts/main/doubanSocore.js
// ==/UserScript==

(function() {
  'use strict';

  function setOmdbApiKey() {
    const currentKey = GM_getValue('omdbApiKey', '');
    const nextKey = window.prompt('Set OMDb API key (stored locally in Tampermonkey):', currentKey);
    if (typeof nextKey === 'string') GM_setValue('omdbApiKey', nextKey.trim());
  }

  GM_registerMenuCommand('Set OMDb API key', setOmdbApiKey);

  function insertAfter(refNode, newNode) {
    if (!refNode || !refNode.parentNode) return;
    refNode.parentNode.insertBefore(newNode, refNode.nextSibling);
  }

  const info = document.querySelector('#info');
  if (!info) return;

  let link = info.querySelector('a[href*="imdb.com/title/tt"]');
  let imdbId = '';
  if (link) {
    const match = link.href.match(/\/title\/(tt\d+)/);
    if (match) imdbId = match[1];
  }

  let imdbIdTextNode;
  if (!imdbId) {
    let imdbLabelSpan;
    const labelSpans = info.querySelectorAll('span.pl');
    for (let i = 0; i < labelSpans.length; i++) {
      if (/imdb/i.test(labelSpans[i].textContent)) {
        imdbLabelSpan = labelSpans[i];
        break;
      }
    }

    if (imdbLabelSpan) {
      let node = imdbLabelSpan.nextSibling;
      while (node) {
        const text = node.nodeType === Node.TEXT_NODE ? node.nodeValue : node.textContent;
        const match = text && text.match(/tt\d+/);
        if (match) {
          imdbId = match[0];
          if (node.nodeType === Node.TEXT_NODE) imdbIdTextNode = node;
          break;
        }
        node = node.nextSibling;
      }
    }

    if (!imdbId) {
      const match = info.textContent && info.textContent.match(/IMDb:\s*(tt\d+)/i);
      if (match) imdbId = match[1];
    }
  }

  if (!imdbId || !imdbId.startsWith('tt')) return;

  const imdbUrl = `https://www.imdb.com/title/${imdbId}/`;

  if (!link) {
    link = document.createElement('a');
    link.href = imdbUrl;
    link.textContent = imdbId;

    if (imdbIdTextNode && imdbIdTextNode.nodeType === Node.TEXT_NODE) {
      const raw = imdbIdTextNode.nodeValue || '';
      const idx = raw.indexOf(imdbId);
      if (idx >= 0) {
        const before = raw.slice(0, idx);
        const after = raw.slice(idx + imdbId.length);
        const frag = document.createDocumentFragment();
        if (before) frag.appendChild(document.createTextNode(before));
        frag.appendChild(document.createTextNode(' '));
        frag.appendChild(link);
        if (after) frag.appendChild(document.createTextNode(after));
        imdbIdTextNode.parentNode.replaceChild(frag, imdbIdTextNode);
      } else {
        info.appendChild(document.createTextNode(' '));
        info.appendChild(link);
      }
    } else {
      info.appendChild(document.createTextNode(' '));
      info.appendChild(link);
    }
  }

  const omdbApiKey = GM_getValue('omdbApiKey', '');
  if (!omdbApiKey) {
    const hint = document.createElement('span');
    hint.textContent = ' (Set OMDb API key in Tampermonkey menu)';
    insertAfter(link, hint);
    return;
  }

  const omdbUrl = `https://www.omdbapi.com/?i=${encodeURIComponent(imdbId)}&apikey=${encodeURIComponent(omdbApiKey)}`;

  function insertStatus(text) {
    const status = document.createElement('span');
    status.textContent = ` (${text})`;
    insertAfter(link, status);
  }

  // Get IMDb/RottenTomatoes/Metacritic scores
  GM_xmlhttpRequest({
    method: 'GET',
    url: omdbUrl,
    headers: {
      Accept: 'application/json'
    },
    timeout: 15000,
    onload: function(response) {
      let data;
      try {
        data = JSON.parse(response.responseText);
      } catch (_) {
        insertStatus('OMDb parse error');
        return;
      }

      if (response.status !== 200) {
        if (data && data.Error) {
          insertStatus(`OMDb: ${data.Error}`);
        } else {
          insertStatus(`OMDb HTTP ${response.status}`);
        }
        return;
      }
      if (!data || data.Response !== 'True') {
        insertStatus(`OMDb: ${data && data.Error ? data.Error : 'No data'}`);
        return;
      }

      const imdbRating = data.imdbRating;
      const imdbVotes = data.imdbVotes;
      const metaScore = data.Metascore;
      const rottenTomatoes = Array.isArray(data.Ratings)
        ? data.Ratings.find(function(r) {
            return r && r.Source === 'Rotten Tomatoes';
          })?.Value
        : undefined;

      const scoreContainer = document.createElement('span'); // create container element

      // add color for Score, Green for score > 7.0, Red for score < 6.5
      const scoreSpan = document.createElement('span');
      scoreSpan.textContent = imdbRating;
      if (imdbRating && imdbRating !== 'N/A') {
        if (parseFloat(imdbRating) > 7.0) {
          scoreSpan.style.color = 'green';
        } else if (parseFloat(imdbRating) < 6.5) {
          scoreSpan.style.color = 'red';
        }
      }

      // append each part to the container
      scoreContainer.appendChild(document.createTextNode(' (IMDb: '));
      scoreContainer.appendChild(scoreSpan);

      if (imdbVotes && imdbVotes !== 'N/A') {
        scoreContainer.appendChild(document.createTextNode(`, Votes: ${imdbVotes}`));
      }
      if (rottenTomatoes && rottenTomatoes !== 'N/A') {
        scoreContainer.appendChild(document.createTextNode(`, RT: ${rottenTomatoes}`));
      }
      if (metaScore && metaScore !== 'N/A') {
        scoreContainer.appendChild(document.createTextNode(`, Metacritic: ${metaScore}`));
      }
      scoreContainer.appendChild(document.createTextNode(')'));

      // insert the container into the page
      insertAfter(link, scoreContainer);
    },
    onerror: function() {
      insertStatus('OMDb request failed');
    },
    ontimeout: function() {
      insertStatus('OMDb timeout');
    }
  });
})();
