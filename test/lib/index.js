'use strict';

const _ = require('lodash');
const fs = require('fs-extra');
const proxyquire = require('proxyquire');
const EventEmitter = require('events').EventEmitter;
const StreamWriter = require('../../lib/stream-writer');

const mkTestplane = () => {
    const emitter = new EventEmitter();

    emitter.events = {
        RUNNER_START: 'runner-start',
        TEST_BEGIN: 'test-begin',
        TEST_END: 'test-end',
        RETRY: 'retry',
        ERROR: 'critical-error',
        RUNNER_END: 'runner-end',
        NEW_BROWSER: 'new-browser'
    };

    emitter.config = {
        getBrowserIds: sinon.stub().returns(['default-bro'])
    };

    return emitter;
};

const mkTest = (opts = {}) => {
    return _.defaults(opts, {
        fullTitle: () => 'default title',
        browserId: 'default-bro'
    });
};

describe('plugin', () => {
    const sandbox = sinon.sandbox.create();
    let testplane;
    let plugin;
    let stream;
    let commandWrapper;

    const initPlugin_ = (opts = {}) => {
        commandWrapper = sandbox.stub();
        plugin = proxyquire('../../index', {
            './lib/commands-wrapper': commandWrapper
        });
        plugin(testplane, opts);
    };

    beforeEach(() => {
        testplane = mkTestplane();
        stream = {
            write: sandbox.stub().named('write'),
            end: sandbox.stub().named('end')
        };
        sandbox.stub(StreamWriter, 'create').returns(stream);
        sandbox.stub(fs, 'copySync');
    });

    afterEach(() => sandbox.restore());

    it('should be enabled by default', () => {
        initPlugin_();

        assert.equal(testplane.listeners(testplane.events.RUNNER_START).length, 1);
    });

    it('should do nothing if plugin is disabled', () => {
        initPlugin_({enabled: false});

        assert.equal(testplane.listeners(testplane.events.RUNNER_START).length, 0);
    });

    it('should create stream on RUNNER_START', () => {
        initPlugin_();

        testplane.emit(testplane.events.RUNNER_START);

        assert.calledOnce(StreamWriter.create);
    });

    describe('on TEST_BEGIN', () => {
        beforeEach(() => {
            initPlugin_();
        });

        it('should set timeStart for test', () => {
            sandbox.stub(Date, 'now').returns(100500);
            const test = mkTest();

            testplane.emit(testplane.events.TEST_BEGIN, test);

            assert.propertyVal(test, 'timeStart', 100500);
        });

        it('should do nothing for pending tests', () => {
            const test = mkTest({pending: true});

            testplane.emit(testplane.events.TEST_BEGIN, test);

            assert.notProperty(test, 'timeStart');
        });

        it('should set retry if test was retried', () => {
            const test = mkTest();

            testplane.emit(testplane.events.RETRY, test);
            testplane.emit(testplane.events.TEST_BEGIN, test);

            assert.propertyVal(test, 'retry', 1);
        });
    });

    describe('on TEST_END', () => {
        beforeEach(() => {
            initPlugin_();
            testplane.emit(testplane.events.RUNNER_START);
        });

        it('should set timeEnd for test', () => {
            sandbox.stub(Date, 'now').returns(100500);
            const test = mkTest();

            testplane.emit(testplane.events.TEST_END, test);

            assert.propertyVal(test, 'timeEnd', 100500);
        });

        it('should write data to stream', () => {
            const test = mkTest();

            testplane.emit(testplane.events.TEST_END, test);

            assert.calledOnceWith(stream.write, test);
        });

        it('should do nothing for pending tests', () => {
            initPlugin_();

            const test = mkTest({pending: true});

            testplane.emit(testplane.events.TEST_END, test);

            assert.notProperty(test, 'timeEnd');
            assert.notCalled(stream.write);
        });
    });

    describe('should close stream', () => {
        it('on error', () => {
            initPlugin_();

            testplane.emit(testplane.events.RUNNER_START);
            testplane.emit(testplane.events.ERROR);

            assert.calledOnce(stream.end);
        });

        it('on runner end', () => {
            initPlugin_();

            testplane.emit(testplane.events.RUNNER_START);
            testplane.emit(testplane.events.RUNNER_END);

            assert.calledOnce(stream.end);
        });
    });

    ['index.html', 'bundle.min.js', 'styles.css'].forEach((fileName, i) => {
        it(`should copy "${fileName}" service file to the report dir on runner end`, () => {
            initPlugin_({path: 'reportDir'});

            testplane.emit(testplane.events.RUNNER_START);
            testplane.emit(testplane.events.RUNNER_END);

            assert.equal(fs.copySync.args[i][1], `reportDir/${fileName}`);
        });
    });
});
