/* eslint-disable no-restricted-globals */
/* eslint-disable no-undef */
'use strict';

const configCountEl = document.getElementById('configCount');
const fetchCountEl = document.getElementById('fetchCount');
const fullCountEl = document.getElementById('fullCount');
const quietCountEl = document.getElementById('quietCount');
const failedCountEl = document.getElementById('failedCount');
const statusEl = document.getElementById('status');

let configCount = 0;
let fetchCount = 0;
let fullCount = 0;
let quietCount = 0;
let failedCount = 0;
let stopped = false;
const QUIET_SVG = '<svg xmlns="http://www.w3.org/2000/svg"></svg>';

function setStatus(text) {
    statusEl.textContent = text;
}

function updateCounts() {
    configCountEl.textContent = String(configCount);
    fetchCountEl.textContent = String(fetchCount);
    fullCountEl.textContent = String(fullCount);
    quietCountEl.textContent = String(quietCount);
    failedCountEl.textContent = String(failedCount);
}

function stopStorm(reason) {
    if (stopped)
        return;
    stopped = true;
    setStatus(reason);
}

async function burstSvgRequests() {
    const requests = [];
    for (let i = 0; i < 220; i++) {
        fetchCount++;
        requests.push(inspectSvgRequest(i));
    }
    updateCounts();
    await Promise.allSettled(requests);
}

async function inspectSvgRequest(index) {
    try {
        const res = await fetch(`./storm.svg?burst=${index}`, {cache: 'no-store'});
        if (!res.ok) {
            failedCount++;
            updateCounts();
            return;
        }

        const svg = (await res.text()).trim();
        if (svg === QUIET_SVG)
            quietCount++;
        else
            fullCount++;
    } catch (_error) {
        failedCount++;
    }

    updateCounts();
}

function burstConfigSaves() {
    const ding = window.ding;
    if (!ding || typeof ding.saveConfig !== 'function')
        return;

    const startedAt = Date.now();
    const timer = setInterval(() => {
        if (stopped || (Date.now() - startedAt) > 2200) {
            clearInterval(timer);
            return;
        }

        configCount++;
        updateCounts();
        ding.saveConfig({
            stormRuns: configCount,
            lastBurstAt: Date.now(),
        });
    }, 10);
}

async function startStorm() {
    try {
        burstConfigSaves();
        await burstSvgRequests();
        stopStorm(
            `Burst finished. Full SVGs: ${fullCount}, quiet 200s: ${quietCount}, failures: ${failedCount}.`
        );
    } catch (error) {
        console.error('[storm-widget] burst failed', error);
        stopStorm('Storm burst failed unexpectedly. Check console logs.');
    }
}

window.addEventListener('pagehide', () => stopStorm('Storm stopped during page hide.'), {once: true});
window.addEventListener('beforeunload', () => stopStorm('Storm stopped during unload.'), {once: true});

startStorm();
