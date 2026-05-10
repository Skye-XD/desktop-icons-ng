/* eslint-disable no-restricted-globals */
/* eslint-disable no-undef */
(function () {
    'use strict';

    // ----- Basic DOM wiring -----
    const dumpEl = document.getElementById('tw-config-dump');

    function appendDebug(lines) {
        if (!dumpEl) {
            // Fallback: log to console if the <pre> is missing
            console.log('[TestWeather]', ...Array.isArray(lines) ? lines : [lines]);
            return;
        }

        const text = Array.isArray(lines) ? lines.join('\n') : String(lines);
        dumpEl.textContent = `${text}\n${dumpEl.textContent || ''}`;
    }

    // ----- Step 1: check & wire window.ding.instanceId from URL -----
    const hasDing = typeof window.ding === 'object' && window.ding !== null;

    appendDebug([
        '== Test Weather debug ==',
        `href=${window.location.href}`,
        `search=${window.location.search}`,
        `hasDing=${hasDing}`,
        `initial ding.instanceId=${hasDing ? window.ding.instanceId : '<<no ding>>'}`,
    ]);

    if (hasDing && !window.ding.instanceId) {
        try {
            const search = window.location && window.location.search || '';
            if (search && search.length > 1) {
                const params = new URLSearchParams(search);
                const qid =
                    params.get('dingInstanceId') ||
                    params.get('widgetInstanceId') ||
                    params.get('instanceId');
                if (qid) {
                    window.ding.instanceId = qid;
                    appendDebug(`wired ding.instanceId from URL: ${qid}`);
                    try {
                        window.ding.log(`Test Weather: instanceId wired from URL: ${qid}`);
                    } catch (e) {
                        appendDebug(`ding.log failed: ${e}`);
                    }
                } else {
                    appendDebug('no dingInstanceId/widgetInstanceId/instanceId query param');
                }
            } else {
                appendDebug('no search string present');
            }
        } catch (e) {
            appendDebug(`ERROR parsing URL for instanceId: ${e}`);
        }
    }

    appendDebug(`final ding.instanceId=${hasDing ? window.ding.instanceId : '<<no ding>>'}`);

    // ----- Step 2: rest of widget wiring -----
    const els = {
        root: document.getElementById('widget-root'),
        location: document.getElementById('tw-location'),
        temp: document.getElementById('tw-temp'),
        icon: document.getElementById('tw-icon'),
        conditionLabel: document.getElementById('tw-condition-label'),
        unitsLabel: document.getElementById('tw-units-label'),
        visitsLabel: document.getElementById('tw-visits-label'),
        cycleConditionBtn: document.getElementById('tw-cycle-condition'),
        toggleThemeBtn: document.getElementById('tw-toggle-theme'),
        randomizeLocationBtn: document.getElementById('tw-randomize-location'),
        configDump: dumpEl,
    };

    const CONDITIONS = ['sunny', 'cloudy', 'rainy'];

    function renderIcon(condition) {
        const icon = els.icon;
        if (!icon)
            return;

        icon.innerHTML = '';

        if (condition === 'cloudy') {
            const cloud = document.createElement('div');
            cloud.className = 'tw-icon-cloud';
            const mainPart = document.createElement('div');
            mainPart.className = 'tw-icon-cloud-main';
            const small = document.createElement('div');
            small.className = 'tw-icon-cloud-small';
            cloud.appendChild(mainPart);
            cloud.appendChild(small);
            icon.appendChild(cloud);
        } else if (condition === 'rainy') {
            const rain = document.createElement('div');
            rain.className = 'tw-icon-rain';

            const cloud = document.createElement('div');
            cloud.className = 'tw-icon-cloud tw-icon-rain-cloud';
            const mainPart = document.createElement('div');
            mainPart.className = 'tw-icon-cloud-main';
            const small = document.createElement('div');
            small.className = 'tw-icon-cloud-small';
            cloud.appendChild(mainPart);
            cloud.appendChild(small);

            rain.appendChild(cloud);

            for (let i = 0; i < 3; i++) {
                const drop = document.createElement('div');
                drop.className = 'tw-icon-rain-drop';
                rain.appendChild(drop);
            }

            icon.appendChild(rain);
        } else {
            const sun = document.createElement('div');
            sun.className = 'tw-icon-sun';
            const core = document.createElement('div');
            core.className = 'tw-icon-sun-core';
            const rays = document.createElement('div');
            rays.className = 'tw-icon-sun-rays';
            sun.appendChild(core);
            sun.appendChild(rays);
            icon.appendChild(sun);
        }
    }

    function render(config) {
        const location = config.location || 'Unknown';
        const units = config.units || 'metric';
        const visits = config.visits ?? 0;
        const condition = config.lastCondition || 'sunny';
        const theme = config.theme || 'dark';

        if (els.location)
            els.location.textContent = location;

        // fake temps just for demo
        let fakeTemp = 70;
        if (condition === 'sunny')
            fakeTemp = 82;
        else if (condition === 'cloudy')
            fakeTemp = 76;
        const unitSuffix = units === 'imperial' ? '°F' : '°C';
        if (els.temp)
            els.temp.textContent = fakeTemp + unitSuffix;

        renderIcon(condition);

        if (els.conditionLabel) {
            els.conditionLabel.textContent =
                `${condition.charAt(0).toUpperCase() + condition.slice(1)} (demo)`;
        }

        if (els.unitsLabel)
            els.unitsLabel.textContent = `Units: ${units}`;
        if (els.visitsLabel)
            els.visitsLabel.textContent = `Visits: ${visits}`;

        if (els.root) {
            els.root.classList.toggle('tw-theme-dark', theme === 'dark');
            els.root.classList.toggle('tw-theme-light', theme === 'light');
        }

        // keep JSON dump in the pre as well
        if (els.configDump) {
            try {
                const json = JSON.stringify(config, null, 2);
                els.configDump.textContent =
                    `${json}\n\n${els.configDump.textContent || ''}`;
            } catch (e) {
                appendDebug(`Error stringifying config: ${e}`);
            }
        }
    }

    function chooseNextCondition(current) {
        const idx = CONDITIONS.indexOf(current);
        if (idx === -1)
            return CONDITIONS[0];
        return CONDITIONS[(idx + 1) % CONDITIONS.length];
    }

    function randomLocation() {
        const samples = [
            'Orlando, US',
            'London, UK',
            'Tokyo, JP',
            'Sydney, AU',
            'Berlin, DE',
        ];
        return samples[Math.floor(Math.random() * samples.length)];
    }

    async function main() {
        let config = {
            location: 'Orlando, US',
            units: 'imperial',
            theme: 'dark',
            visits: 0,
            lastCondition: 'sunny',
        };

        if (hasDing && typeof window.ding.getConfig === 'function' &&
            window.ding.instanceId) {
            try {
                const saved = await window.ding.getConfig();
                if (saved && typeof saved === 'object')
                    config = Object.assign(config, saved);
                appendDebug(`getConfig() returned: ${JSON.stringify(saved)}`);
            } catch (e) {
                appendDebug(`getConfig failed: ${e}`);
            }
        } else {
            appendDebug(`Skipping getConfig: hasDing=${hasDing
            } instanceId=${hasDing ? window.ding.instanceId : 'n/a'}`);
        }

        // bump visits
        config.visits = (config.visits ?? 0) + 1;

        if (hasDing && typeof window.ding.saveConfig === 'function' &&
            window.ding.instanceId) {
            try {
                window.ding.saveConfig(config);
                window.ding.log(`Test Weather: saveConfig, visits=${config.visits}`);
            } catch (e) {
                appendDebug(`saveConfig/log failed: ${e}`);
            }
        }

        // Wire UI
        if (els.cycleConditionBtn) {
            els.cycleConditionBtn.addEventListener('click', () => {
                config.lastCondition = chooseNextCondition(config.lastCondition || 'sunny');
                render(config);
                if (hasDing && window.ding.instanceId) {
                    try {
                        window.ding.saveConfig(config);
                        window.ding.log(`Test Weather: condition -> ${config.lastCondition}`);
                    } catch (e) {
                        appendDebug(`cycleCondition saveConfig/log failed: ${e}`);
                    }
                }
            });
        }

        if (els.toggleThemeBtn) {
            els.toggleThemeBtn.addEventListener('click', () => {
                config.theme = config.theme === 'dark' ? 'light' : 'dark';
                render(config);
                if (hasDing && window.ding.instanceId) {
                    try {
                        window.ding.saveConfig(config);
                        window.ding.log(`Test Weather: theme -> ${config.theme}`);
                    } catch (e) {
                        appendDebug(`toggleTheme saveConfig/log failed: ${e}`);
                    }
                }
            });
        }

        if (els.randomizeLocationBtn) {
            els.randomizeLocationBtn.addEventListener('click', () => {
                config.location = randomLocation();
                render(config);
                if (hasDing && window.ding.instanceId) {
                    try {
                        window.ding.saveConfig(config);
                        window.ding.log(`Test Weather: location -> ${config.location}`);
                    } catch (e) {
                        appendDebug(`randomizeLocation saveConfig/log failed: ${e}`);
                    }
                }
            });
        }

        render(config);
    }

    main().catch(e => {
        appendDebug(`main() crashed: ${e}`);
        if (hasDing && window.ding.instanceId) {
            try {
                window.ding.log(`Test Weather: main() crashed: ${e}`);
            } catch (_) {
                /* ignore */
            }
        }
    });
})();
