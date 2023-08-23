import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import {DingManager} from './dingManager.js';

export let dingManager;
export default class dingExtension extends Extension {
    constructor(metadata) {
        super(metadata);
        this.DesktopIconsUsableArea = null;
    }

    enable() {
        dingManager = new DingManager(this.path);
        dingManager.enable();
        this.DesktopIconsUsableArea = dingManager.DesktopIconsUsableArea;
    }

    disable() {
        dingManager?.disable();
        dingManager = null;
        this.DesktopIconsUsableArea = null;
    }
}
