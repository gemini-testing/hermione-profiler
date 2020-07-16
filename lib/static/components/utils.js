'use strict';

import _ from 'lodash';

const countTestCommands = (data) => {
    const countCommands = (test) => _.sum(test.cl.map(countCommands).concat(test.cl.length));

    return _.map(data, (test) => _.set(test, 'count', countCommands(test)));
};

const groupBySession = (data) => {
    return _(data)
        .groupBy('sid')
        .map((tests, sid) => {
            return {
                sid,
                bid: _.head(tests).bid,
                cl: _.flatMap(tests, 'cl'),
                d: _.sumBy(tests, 'd')
            }
        })
        .value();
};

const groupByCommand = (data) => {
    const map = {};

    const goDeep = (data, browser) => {
        if (data.cn) {
            const key = `${browser}#${data.cn}`;
            let command = map[key];
            if (!command) {
                command = {
                    cn: data.cn,
                    bid: browser,
                    d: [],
                    dExclusive: []
                };
                map[key] = command;
            }
            command.d.push(data.d);
            const dExclusive = Math.max(0, data.d - _.sum(_.map(data.cl, 'd')));
            command.dExclusive.push(dExclusive);
        }

        data.cl.forEach((command) => goDeep(command, browser));
    };

    data.forEach((task) => goDeep(task, task.bid));
    return _.values(map);
};

/**
 * Для некоторых команд поле d не заполнено. Чтобы незаполненное значение не влияло на последующие вычисления,
 * установим его в 0.
 * @param {Object} command
 */
const fixD = (command) => {
    if (command.cn) {
        if (!command.d) {
            command.d = 0;
        }
    }

    command.cl.forEach(fixD);
};

const fetchPercentiles = (data) => {
    const writePercentile = (test, perc) => {
        const arr = test.d;
        const index = Math.floor(arr.length * perc / 100);
        test[`percentile${perc}`] = arr[index];
    };

    data.forEach((test) => {
        test.d.sort((a, b) => a - b);
        writePercentile(test, 95);
        writePercentile(test, 80);
        writePercentile(test, 50);
    });
};

const fetchSums = (data) => {
    data.forEach((command) => {
        command.dSum = _.sum(command.d);
        command.dExclusiveSum = _.sum(command.dExclusive);
    });
};

const groupByExecutionThread = (tests) => {
    const findThreadIdx = (test, threads) => {
        const idxBySession = threads.findIndex((thread) => _.last(thread).sid === test.sid);
        if (idxBySession !== -1) {
            return idxBySession;
        }

        const idxByTest = threads.findIndex((thread) => _.last(thread).n === test.n);
        if (idxByTest !== -1) {
            return idxByTest;
        }

        const idxByTime = threads.findIndex((thread) => _.last(thread).te < test.ts);
        if (idxByTime !== -1) {
            return idxByTime;
        }

        return threads.length;
    };

    return _.sortBy(tests, 'ts').reduce((threads, test) => {
        const idx = findThreadIdx(test, threads);
        threads[idx] = threads[idx] || [];
        threads[idx].push(test);

        return _.sortBy(threads, (thread) => _.last(thread).te);
    }, []);
};

export default {
    prepareDataForTestsTab: (data) => {
        return countTestCommands(data);
    },
    prepareDataForSessionsTab: (data) => {
        const groupedData = groupBySession(data);
        return countTestCommands(groupedData);
    },
    prepareDataForCommandsTab: (data) => {
        data.forEach(fixD);
        const groupedData = groupByCommand(data);
        fetchPercentiles(groupedData);
        fetchSums(groupedData);
        return groupedData;
    },
    prepareDataForTimelineTab: (data) => {
        return _(data)
            .groupBy('bid')
            .mapValues(groupByExecutionThread)
            .value();
    }
}
