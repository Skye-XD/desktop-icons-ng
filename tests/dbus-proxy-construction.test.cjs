/* eslint-env node */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '../app/utils/dbusUtils.js'), 'utf8')
.replace(/^import .*;\n/gm, '').replace(/^export .*;\n/gm, '');

for (const inSystemBus of [false, true]) {
    test(`introspection constructs the returned proxy class on the ${inSystemBus ? 'system' : 'session'} bus`, () => {
        const calls = [];
        const xml = '<node><interface name="org.example.Test"/></node>';
        const interfaceXML = '<node><interface name="org.freedesktop.DBus.Introspectable"/></node>';
        const buses = {system: {}, session: {}};
        const Manager = vm.runInNewContext(`${source}\nDBusManager`, {
            imports: {signals: {addSignalMethods() {}}},
            Gio: {
                DBus: buses,
                DBusProxy: {
                    makeProxyWrapper(receivedXML) {
                        assert.equal(receivedXML, interfaceXML);
                        return class {
                            constructor(...args) {
                                calls.push(args);
                            }

                            IntrospectSync() {
                                return [xml];
                            }
                        };
                    },
                },
            },
            DBusInterfaces: {
                DBusInterfaces: {
                    'org.freedesktop.DBus.Introspectable': interfaceXML,
                },
            },
            console: {log() {}},
        });
        const manager = Object.create(Manager.prototype);
        assert.equal(manager.getIntrospectionData('org.example.Test', '/org/example/Test', inSystemBus), xml);
        assert.equal(calls.length, 1);
        assert.deepEqual(Array.from(calls[0]), [
            inSystemBus ? buses.system : buses.session,
            'org.example.Test', '/org/example/Test', null,
        ]);
    });
}
