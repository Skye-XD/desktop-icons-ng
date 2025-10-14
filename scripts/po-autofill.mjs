// Sundeep Mediratta (c) 2025
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Auto-fill missing translations in .po files using LibreTranslate API.
// Requires LibreTranslate instance running locally or remotely.
// Usage: node scripts/po-autofill.mjs
// Requires: npm i pofile node-fetch
// Config via env:
//   LT_URL (default: http://localhost:5000) - LibreTranslate instance URL
//   LT_API_KEY (default: none) - LibreTranslate API key if required
//   LT_SOURCE (default: en) - Source language code in PO files
//
// This script reads the 'po/LINGUAS' file for target languages, processes each
// corresponding 'po/<lang>.po' file, and fills in missing translations using
// LibreTranslate. It only fills entries that are completely empty and ensures
// that placeholders match between source and translated text. Translated entries
// are marked as 'machine-translated' for later human review.
//
/* eslint-env node */

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import fetch from 'node-fetch';
import PO from 'pofile';

// --- Config via env ---
const LT_URL = process.env.LT_URL || 'http://localhost:5000';
const LT_API_KEY = process.env.LT_API_KEY || '';
const LT_SOURCE = process.env.LT_SOURCE || 'en';
const SRC_ROOT = process.env.MESON_SOURCE_ROOT || process.cwd();
const PO_DIR = path.join(SRC_ROOT, 'po');
var supportedLanguagesCache = null;

// --- Placeholder handling ---
const RE_QUOTED_DQ = /"(?:\s*)(?:\$\{[A-Za-z0-9_-]+\}|\{[A-Za-z0-9_-]+\})"(?!")/;
const RE_QUOTED_SQ = /'(?:\s*)(?:\$\{[A-Za-z0-9_-]+\}|\{[A-Za-z0-9_-]+\})'(?!')/;
const RE_QUOTED_BT = /`(?:\s*)(?:\$\{[A-Za-z0-9_-]+\}|\{[A-Za-z0-9_-]+\})`/;
// Full-ish printf (%... incl. positional/width/precision/length + %%)
const RE_PRINTF =
  /%(?:\d+\$)?[#0\- +']?(?:\d+|\*)?(?:\.(?:\d+|\*))?(?:hh|h|ll|l|j|z|t|L)?[diuoxXfFeEgGaAcspn%]/;
// ${name}
const RE_JS_DOLLAR_BRACE = /\$\{[A-Za-z0-9_-]+\}/;
// {name} / {foo-bar}
const RE_BRACE_NAME = /\{[A-Za-z0-9_-]+\}/;
// {0}
const RE_BRACE_INDEX = /\{\d+\}/;
// ICU: {name, number} / {name, plural, ...}
const RE_ICU = /\{[A-Za-z0-9_-]+\s*,[^}]*\}/;
// Python/Django: %(name)s
const RE_PY_NAMED = /%\([A-Za-z0-9_-]+\)[sdifuxge]/;
// Ruby-ish: %{name}
const RE_RUBY_PCT_BRACE = /%\{[A-Za-z0-9_-]+\}/;
// HTML/XML-ish tags (kept separate if you freeze in a second pass)
const RE_HTML_TAG = /<\/?[A-Za-z][A-Za-z0-9:-]*(?:\s+[^<>]*?)?>/;

function unionRegex(patterns) {
    return new RegExp(patterns.map(p => p.source).join('|'), 'g');
}

const PLACEHOLDER_REGEX = unionRegex([
    // Quoted forms first
    RE_QUOTED_DQ,
    RE_QUOTED_SQ,
    RE_QUOTED_BT,
    // Then all the bare/other forms
    RE_PRINTF,
    RE_JS_DOLLAR_BRACE,
    RE_BRACE_NAME,
    RE_BRACE_INDEX,
    RE_ICU,
    RE_PY_NAMED,
    RE_RUBY_PCT_BRACE,
]);

const RE_TOKEN_PREFIX  = /[A-Z]{2,5}/;                           // PH, TAG, Q, ...
const RE_BRACKETY_LOOSE = /\[\[\s*([A-Za-z]{2,5})\s*(\d+)?\s*\]?/g; // [[ph 0] / [[PH0  / [[PH]]
const RE_PAREN         = /\(\s*([A-Za-z]{2,5})\s*(\d+)\s*\)/g;     // (ph0)
const RE_BARE          = /\b([A-Za-z]{2,5})\s*(\d+)\b/g;           // ph0
const RE_NOID_BOUNDARY = new RegExp(String.raw`\b(${RE_TOKEN_PREFIX.source})\b`, 'g');
const RE_CLEAN_SPACING = /\[\[\s*([A-Za-z]{2,5})\s*(\d+)\s*\]\]/g; // [[ PH  7 ]]
const RE_TRAIL_MISSING = /\[\[([A-Za-z]{2,5})(\d+)\](?!\])/g;      // [[PH0]

// Matches “[anything]” that is NOT already part of a “[[…]]”
const RE_ONE_MAP_BRACKETED = /(?<!\[)\[[^\]]*]/g;

// --- Helpers ---
function parseLinguasFile(linguasPath) {
    const txt = fs.existsSync(linguasPath) ? fs.readFileSync(linguasPath, 'utf8') : '';
    return txt
        .split(/\r?\n/)
        .map(line => line.replace(/#.*$/, ''))        // strip comments
        .join(' ')                                    // allow multi-line
        .split(/\s+/)                                 // split by whitespace
        .map(s => s.trim())
        .filter(Boolean);
}

function poLangToLtTarget(lang) {
    const code = lang.toLowerCase();
    switch (code) {
    case 'zh_cn':
    case 'zh-hans':
    case 'zh_sg':
        return 'zh-Hans';
    case 'zh_tw':
    case 'zh_hk':
    case 'zh-hant':
        return 'zh-Hant';
    default:
        return lang.split(/[_@.]/)[0].toLowerCase();
    }
}

async function ltListLanguages() {
    const url = `${LT_URL.replace(/\/+$/, '')}/languages`;
    const opts = {method: 'GET', headers: {'accept': 'application/json'}};

    if (LT_API_KEY)
        opts.headers['X-Api-Key'] = LT_API_KEY;

    const r = await fetch(url, opts);
    if (!r.ok) {
        const msg = await r.text().catch(() => r.statusText);
        throw new Error(`LT /languages error ${r.status}: ${msg}`);
    }

    const data = await r.json();
    // Normalize just in case
    const supportedLanguages = Array.isArray(data)
        ? data.map(x => ({code: String(x.code || '').trim(), name: String(x.name || '').trim()}))
        : [];

    return supportedLanguages;
}

function ltSupportsLanguage(lang) {
    if (!supportedLanguagesCache)
        throw new Error('ltSupportsLanguage called before supportedLanguagesCache is set');

    return supportedLanguagesCache.some(l => l.code === lang);
}

function placeTokens(input, regex, prefix) {
    let i = 0;
    const originalMap = [];

    const tokenized = String(input).replace(regex, m => {
        const tok = `[[${prefix}${i++}]]`;
        originalMap.push([tok, m]);
        return tok;
    });

    const regexCheck = new RegExp(`\\[\\[${prefix}(\\d+)\\]\\]`, 'g');

    function healSingleTokens(text) {
        let out = String(text);
        if (originalMap.length !== 1)
            return out;
        console.log(`Healing single token mismatch: ${out}`);
        const key = originalMap[0][0];
        out = out.replace('[[', '[');
        out = out.replace(']]', ']');
        out = out.replace(/\[[^\]]*]/, key);
        out = out.replace(/\([^)]*\)/, key);

        if (out.includes(key))
            return out;

        out = out.replace(/^\[?P(?:H(?:\d)?)?$/, key);

        if (out.includes(key))
            return out;

        // Last resort: just append it
        out = `out ${key}`;
        return out;
    }

    function validateTokens(text) {
        if (originalMap.length === 0) {
            // No tokens expected → ensure none were introduced
            return !String(text).match(regexCheck);
        }

        for (const [tok] of originalMap) {
            if (!text.includes(tok))
                return false;
        }
        // Also ensure no new tokens were introduced
        const found = [];
        let m;
        regexCheck.lastIndex = 0;

        while ((m = regexCheck.exec(text)) !== null)
            found.push(m[0]);

        if (found.length !== originalMap.length)
            return false;

        return true;
    }

    const revertTokens = text => {
        let out = String(text);
        let fuzzy = false;

        // First, normalize common tokenization mistakes
        if (!validateTokens(out)) {
            out = healSingleTokens(out);
            fuzzy = true;
        }

        if (!validateTokens(out)) {
            console.error('healing failed:', out);
            return {text: '', fuzzy}; // give up
        }

        for (const [tok, orig] of originalMap)
            out = out.replaceAll(tok, orig);

        const reversion = {text: out, fuzzy};
        return reversion;
    };

    return {tokenized, revertTokens, count: originalMap.length};
}

function nFunctionScheduler(n) {
    const queue = [];
    let active = 0;

    const next = () => {
        if (active >= n || queue.length === 0)
            return;
        active++;
        const {fn, resolve, reject} = queue.shift();
        Promise.resolve()
            .then(fn)
            .then(v => {
                active--;
                resolve(v);
                next();
            })
            .catch(e => {
                active--;
                reject(e);
                next();
            });
    };

    function scheduler(fn) {
        return new Promise((resolve, reject) => {
            queue.push({fn, resolve, reject});
            next();
        });
    }

    return scheduler;
}

const fourFuncScheduler = nFunctionScheduler(4);

async function ltTranslate(text, source, target) {
    const body = {
        q: text,
        source,
        target,
        format: 'text',
    };
    if (LT_API_KEY)
        body.api_key = LT_API_KEY;

    const url = `${LT_URL.replace(/\/+$/, '')}/translate`;
    const resp = await fourFuncScheduler(async () => {
        const r = await fetch(url, {
            method: 'POST',
            headers: {'content-type': 'application/json'},
            body: JSON.stringify(body),
        });
        if (!r.ok) {
            const msg = await r.text().catch(() => r.statusText);
            throw new Error(`LibreTranslate error ${r.status}: ${msg}`);
        }
        return r.json();
    });

    return resp?.translatedText || '';
}

function forceCleanEntry(it) {
    // Clear existing translation text but keep the entry fuzzy for human review.
    if (it.msgid_plural) {
        if (!it.msgstr)
            it.msgstr = [];
        for (let i = 0; i < it.msgstr.length; i++)
            it.msgstr[i] = '';
    } else {
        it.msgstr = [''];
    }
    it.flags = it.flags || {};
    it.flags.fuzzy = true;
}

function processPoFile(poPath, targetLang) {
    return new Promise((resolve, reject) => {
        PO.load(poPath, async (err, po) => {
            if (err)
                reject(err);

            let changed = 0;
            let markedfuzzy = 0;
            const source = LT_SOURCE;

            const target = poLangToLtTarget(targetLang);

            if (!ltSupportsLanguage(target)) {
                console.warn(`[${targetLang}] Skipping: LibreTranslate does not support target language '${target}'`);
                resolve({lang: targetLang, changed, markedfuzzy});
                return;
            }

            for (const it of po.items) {
                if (!it.msgid)
                    continue; // skip header

                it.flags = it.flags || {};
                it.translatorComments = it.translatorComments || [];

                const isFuzzy = !!it.flags.fuzzy;
                const hasEmpty = !it.msgstr || it.msgstr.some(s => !s);
                const hasMachineTranslatedcomment = it.comments.includes('MT: LibreTranslate');
                const hasMachineTranslatedFlag = !!it.flags['machine-translated'];

                const needsFilling = hasEmpty || isFuzzy;
                const needsFlagRestore = hasMachineTranslatedcomment && !hasMachineTranslatedFlag;
                const needsCommentRestore = hasMachineTranslatedFlag && !hasMachineTranslatedcomment;

                if (!needsFilling && !needsFlagRestore && !needsCommentRestore)
                    continue;

                if (needsFilling) {
                    try {
                        const srcText = it.msgid;
                        if (!srcText)
                            continue;

                        // 1) Freeze placeholders + tags
                        const ph = placeTokens(srcText, PLACEHOLDER_REGEX, 'PH');
                        const th = placeTokens(ph.tokenized, RE_HTML_TAG, 'TAG');

                        // 2) Translate masked source
                        // eslint-disable-next-line no-await-in-loop
                        const raw = await ltTranslate(th.tokenized, source, target);

                        if (!raw)
                            continue;

                        // 3) Unfreeze (same order)
                        const x = th.revertTokens(raw);
                        const y = ph.revertTokens(x.text);
                        const fuzzy = x.fuzzy && y.fuzzy;
                        const t = y.text;

                        // If any step failed, t will be null
                        // If tokens were missing/extra, t will be null
                        // 4) Validate placeholders
                        if (!t) {
                            // console.error(`[${targetLang}] MT placeholder mismatch for msgid="${it.msgid}"`);

                            const refs = Array.isArray(it.references) ? it.references.slice(0, 2).join(', ') : '';
                            console.warn(`[${targetLang}] MT placeholder mismatch: ${refs ? `${refs} :: ` : ''}msgid=${JSON.stringify(it.msgid)}`);

                            // Optional: show a tiny peek at the masked output for debugging
                            // (comment out after you’re satisfied; avoids noisy logs)
                            console.warn(`  masked-src: ${th.tokenized}`);
                            console.warn(`  mt-output : ${raw}`);

                            // Clear existing translation text but keep fuzzy for human review.
                            forceCleanEntry(it);
                            changed++;
                            continue;
                        }

                        if (it.msgid_plural) {
                            if (isFuzzy) {
                                for (let i = 0; i < it.msgstr.length; i++)
                                    it.msgstr[i] = t;
                            } else {
                                for (let i = 0; i < it.msgstr.length; i++) {
                                    if (!it.msgstr[i])
                                        it.msgstr[i] = t;
                                }
                            }
                        } else {
                            it.msgstr = it.msgstr || [''];
                            it.msgstr[0] = t;
                        }

                        if (!fuzzy) {
                            delete it.flags.fuzzy;
                        } else {
                            it.flags.fuzzy = true;
                            markedfuzzy++;
                        }
                        if (!hasMachineTranslatedFlag)
                            it.flags['machine-translated'] = true;

                        // ALSO add an extracted comment (this WILL survive gettext steps)
                        if (!hasMachineTranslatedcomment)
                            it.comments.push('MT: LibreTranslate');

                        changed++;
                    } catch (e) {
                        console.error(`[${targetLang}] MT failed for msgid="${it.msgid}": ${e.message}`);
                    }
                } else {
                    // Just restore the flag if missing from gettext msgmerge runs
                    if (!hasMachineTranslatedFlag)
                        it.flags['machine-translated'] = true;
                    if (needsCommentRestore)
                        it.comments.push('MT: LibreTranslate');
                    changed++;
                }
            }

            // --- Header policy ---
            // We *compute* whether the header needs LibreTranslate, but we only APPLY it
            // if we're already going to write due to content changes. This keeps the file
            // untouched when no translations changed.
            const existingGen = (po.headers['X-Generator'] || '').trim();
            const needsLtHeader = !existingGen || !/libretranslate/i.test(existingGen);

            // Keep header and any item that has references OR extracted comments
            const cleanedItems = po.items.filter(it => {
                if (it.obsolete)
                    return false;

                if (it.msgid === '')
                    return true; // keep header
                const hasRefs = Array.isArray(it.references) && it.references.length > 0;
                const hasExtracted = Array.isArray(it.extractedComments) && it.extractedComments.length > 0;
                return hasRefs || hasExtracted;
            });

            const removed = po.items.length - cleanedItems.length;
            if (removed > 0) {
                console.log(`[${targetLang}] Removed ${removed} obsolete entries`);
                po.items = cleanedItems;
                changed += removed;
            }

            // Write back ONLY if translations changed; if so, also add header if needed.
            if (changed > 0) {
                if (needsLtHeader) {
                    const base = existingGen ? `${existingGen.replace(/\s*;*\s*$/, '')}; ` : '';
                    po.headers['X-Generator'] = `${base}LibreTranslate (auto-fill)`;
                }
                await fsp.writeFile(poPath, po.toString(), 'utf8');
            }

            resolve({lang: targetLang, changed, markedfuzzy});
        });
    });
}

// --- Main ---
(async () => {
    const linguasPath = path.join(PO_DIR, 'LINGUAS');
    const langs = parseLinguasFile(linguasPath);
    if (!langs.length) {
        console.error(`No languages found in ${linguasPath}`);
        process.exit(1);
    }
    if (!supportedLanguagesCache)
        supportedLanguagesCache = await ltListLanguages();

    console.log('Supported LT languages:', supportedLanguagesCache.map(l => l.code).join(', '));

    let totalChanged = 0;
    for (const lang of langs) {
        const poFile = path.join(PO_DIR, `${lang}.po`);
        if (!fs.existsSync(poFile)) {
            console.warn(`Skipping ${lang}: ${poFile} not found`);
            continue;
        }
        try {
            // eslint-disable-next-line no-await-in-loop
            const {changed, markedfuzzy} = await processPoFile(poFile, lang);
            totalChanged += changed;
            console.log(`[${lang}] Updated ${changed} Marked Fuzzy ${markedfuzzy}`);
        } catch (e) {
            console.error(`[${lang}] Error: ${e.message}`);
        }
    }
    console.log(`All done. Total updated: ${totalChanged}`);
})();
