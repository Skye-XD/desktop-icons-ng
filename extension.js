import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import {DingManager} from './dingManager.js';

export let dingManager;
export default class dingExtension extends Extension {
    enable() {
        dingManager = new DingManager(this.path);
        dingManager.enable();
    }

    disable() {
        dingManager?.disable();
        dingManager = null;
    }
}
