(function () {
    if (!window.ding) {
        console.error('prefs.js: window.ding is not available');
        return;
    }

    // Log basic sanity info
    ding.log('prefs.js loaded');
    ding.log(`instanceId=${ding.instanceId}`);
    ding.log(`mode=${ding.mode}`);

    if (ding.mode !== 'prefs') {
        ding.log('WARNING: prefs.js is not running in prefs mode');
    } else {
        ding.log('Preferences running in correct mode');
    }

    // Optional: load config to prove API works
    ding.getConfig()?.then?.(config => {
        ding.log('Current config:');
        ding.log(JSON.stringify(config));
    });
})();
