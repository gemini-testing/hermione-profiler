'use strict';

const _ = require('lodash');
const path = require('path');
const fs = require('fs-extra');
const parseConfig = require('./lib/config');
const DataFile = require('./lib/data-file');
const wrapCommands = require('./lib/commands-wrapper');

module.exports = (hermione, opts) => {
    const pluginConfig = parseConfig(opts);
    if (!pluginConfig.enabled) {
        return;
    }

    if (hermione.isWorker()) {
        hermione.on(hermione.events.NEW_BROWSER, wrapCommands);
        return;
    }

    let dataFile = DataFile.create(pluginConfig.path);
    const retriesMap = _(hermione.config.getBrowserIds())
        .zipObject()
        .mapValues(() => new Map())
        .value();

    hermione.on(hermione.events.RETRY, (test) => {
        const fullTitle = test.fullTitle();

        const retries = retriesMap[test.browserId];
        const retry = retries.get(fullTitle) || 0;
        retries.set(fullTitle, retry + 1);
    });

    hermione.on(hermione.events.TEST_BEGIN, (test) => {
        if (test.pending) {
            return;
        }

        test.timeStart = Date.now();
        const retry = retriesMap[test.browserId].get(test.fullTitle());
        if (retry) {
            test.retry = retry;
        }
    });
    hermione.on(hermione.events.TEST_END, (test) => {
        if (test.pending) {
            return;
        }

        test.timeEnd = Date.now();
        dataFile.write(test);
    });

    hermione.on(hermione.events.RUNNER_END, async () => {
        await dataFile.end();
        copyToReportDir(pluginConfig.path, ['index.html', 'bundle.min.js', 'styles.css']);
    });
};

function copyToReportDir(reportDir, files) {
    files.forEach((fileName) => {
        const from = path.join(__dirname, 'lib', 'static', fileName);
        const to = path.join(reportDir, fileName);
        fs.copySync(from, to);
    });
}
