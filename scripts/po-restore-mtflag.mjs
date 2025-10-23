// Sundeep Mediratta (c) 2025
// SPDX-License-Identifier: GPL-3.0-or-later
//
// This script reads the 'po/LINGUAS' file for target languages, processes each
// corresponding 'po/<lang>.po' file, and fills in missing 'machine-translated'
// flags if the MT: Libretranslate header is present or vice versa.
//
/* eslint-env node */

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import PO from 'pofile';

const SRC_ROOT = process.env.MESON_SOURCE_ROOT || process.cwd();
const PO_DIR = path.join(SRC_ROOT, 'po');

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

function processPoFile(poPath, targetLang) {
    return new Promise((resolve, reject) => {
        PO.load(poPath, async (err, po) => {
            if (err) {
                reject(err);
                return;
            }

            let changed = 0;

            for (const it of po.items) {
                if (!it.msgid)
                    continue; // skip header

                it.flags = it.flags || {};

                // const isFuzzy = !!it.flags.fuzzy;
                // const hasEmpty = !it.msgstr || it.msgstr.some(s => !s);
                const hasMachineTranslatedcomment = it.comments.includes('MT: LibreTranslate');
                const hasMachineTranslatedFlag = !!it.flags['machine-translated'];

                // const needsFilling = hasEmpty || isFuzzy;
                const needsFlagRestore = hasMachineTranslatedcomment && !hasMachineTranslatedFlag;
                const needsCommentRestore = hasMachineTranslatedFlag && !hasMachineTranslatedcomment;

                if (!needsFlagRestore && !needsCommentRestore)
                    continue;

                // Just restore the flag if missing from gettext msgmerge runs
                if (!hasMachineTranslatedFlag)
                    it.flags['machine-translated'] = true;
                if (needsCommentRestore)
                    it.comments.push('MT: LibreTranslate');
                changed++;
            }

            if (changed > 0)
                await fsp.writeFile(poPath, po.toString(), 'utf8');

            resolve({lang: targetLang, changed});
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

    let totalChanged = 0;
    for (const lang of langs) {
        const poFile = path.join(PO_DIR, `${lang}.po`);
        if (!fs.existsSync(poFile)) {
            console.warn(`Skipping ${lang}: ${poFile} not found`);
            continue;
        }
        try {
            // eslint-disable-next-line no-await-in-loop
            const {changed} = await processPoFile(poFile, lang);
            totalChanged += changed;
            console.log(`[${lang}] Updated ${changed}`);
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            console.error(`[${lang}] Error: ${msg}`);
        }
    }
    console.log(`All done. Total updated: ${totalChanged}`);
})();
