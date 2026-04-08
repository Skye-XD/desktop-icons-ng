import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import {DingManager} from './dingManager.js';

export default class DingExtension extends Extension {
    constructor(metadata) {
        super(metadata);
        this.dingManager = null;
        this.DesktopIconsUsableArea = null;
    }

    enable() {
        if (!this.dingManager)
            this.dingManager = new DingManager(this);

        this.dingManager.enable();
        this.DesktopIconsUsableArea = this.dingManager.DesktopIconsUsableArea;
    }

    disable() {
        this.dingManager?.disable();
        this.dingManager = null;
        this.DesktopIconsUsableArea = null;
    }
}
