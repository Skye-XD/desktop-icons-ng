import {_} from '../dependencies/gettext.js';

// app.actionName, Hint: Hint to display for action, Accel: Accelerator Key
// Editing this file will automatically set the hints and Accelerator when
// the program is started.
//
// Make sure file is not broken by edits!

export const DefaultShortcuts = {
    doNewFolder: {Hint: _('New Folder'), Accel: '<Control><Shift>N'},
    doPaste: {Hint: _('Paste'), Accel: '<Control>V'},
    doUndo: {Hint: _('Undo'), Accel: '<Control>Z'},
    doRedo: {Hint: _('Redo'), Accel: '<Control><Shift>Z'},
    selectAll: {Hint: _('Select All'), Accel: '<Control>A'},
    showDesktopInFiles: {Hint: _('Show Desktop in Files'), Accel: ''},
    openInTerminal: {Hint: _('Open in Terminal'), Accel: ''},
    changeBackGround: {Hint: _('Change Background'), Accel: ''},
    changeDisplaySettings: {Hint: _('Change Display Settings'), Accel: ''},
    changeDesktopIconSettings: {Hint: _('Change Desktop Icon Settings'), Accel: ''},
    cleanUpIcons: {Hint: _('Clean Up Icons'), Accel: ''},
    keepArranged: {Hint: _('Keep Arranged'), Accel: ''},
    keepStacked: {Hint: _('Keep Stacked'), Accel: ''},
    sortSpecialFolders: {Hint: _('Sort Special Folders'), Accel: ''},
    arrangeaction: {Hint: _('Arrange Icons'), Accel: ''},
    findFiles: {Hint: _('Find Files'), Accel: '<Control>F'},
    updateDesktop: {Hint: _('Update Desktop'), Accel: 'F5'},
    showHideHiddenFiles: {Hint: _('Show Hidden Files'), Accel: '<Control>H'},
    unselectAll: {Hint: _('Unselect All'), Accel: 'Escape'},
    previewAction: {Hint: _('Preview'), Accel: 'space'},
    chooseIconLeft: {Hint: _('Choose Icon Left'), Accel: 'Left'},
    chooseIconRight: {Hint: _('Choose Icon Right'), Accel: 'Right'},
    chooseIconUp: {Hint: _('Choose Icon Up'), Accel: 'Up'},
    chooseIconDown: {Hint: _('Choose Icon Down'), Accel: 'Down'},
    menuKeyPressed: {Hint: _('Show Menu'), Accel: 'Menu,<Shift>F10'},
    displayShellBackgroundMenu: {Hint: _('Display Shell Background Menu'), Accel: ''},
    createDesktopShortcut: {Hint: _('Create Desktop Shortcut'), Accel: ''},
    textEntryAccelsTurnOn: {Hint: _('Text Entry Accels Turn On'), Accel: ''},
    textEntryAccelsTurnOff: {Hint: _('Text Entry Accels Turn Off'), Accel: ''},
    newDocument: {Hint: _('New Document'), Accel: ''},
    showShortcutViewer: {Hint: _('Show Shortcut Viewer'), Accel: ''},
    toggleVisibility: {Hint: _('Show Or Hide Desktop Icons'), Accel: ''},
    // FileItem Menu Actions
    openMultipleFileAction: {Hint: 'Open All', Accel: '<Control>Return'},
    openOneFileAction: {Hint: 'Open Item', Accel: 'Return'},
    stackunstack: {Hint: 'Stack/Unstack', Accel: ''},
    doopenwith: {Hint: 'Open With', Accel: ''},
    graphicslaunch: {Hint: 'Launch using Integrated Graphics Card', Accel: ''},
    runasaprogram: {Hint: 'Run as a Program', Accel: ''},
    docut: {Hint: 'Cut Item', Accel: '<Control>X'},
    docopy: {Hint: 'Copy Item', Accel: '<Control>C'},
    dorename: {Hint: 'Rename Item', Accel: 'F2'},
    movetotrash: {Hint: 'Move to Trash', Accel: 'Delete'},
    deletepermanantly: {Hint: 'Delete Permanently', Accel: '<Shift>Delete'},
    emptytrash: {Hint: 'Empty Trash', Accel: ''},
    allowdisallowlaunching: {Hint: 'Allow/Disallow Launching', Accel: ''},
    eject: {Hint: 'Eject', Accel: ''},
    unmount: {Hint: 'Unmount', Accel: ''},
    extractautoar: {Hint: 'Extract Here', Accel: ''},
    extracthere: {Hint: 'Extract Here', Accel: ''},
    extractto: {Hint: 'Extract To', Accel: ''},
    sendto: {Hint: 'Email to', Accel: ''},
    compressfiles: {Hint: 'Compress Files', Accel: ''},
    newfolderfromselection: {Hint: 'New Folder from Selection', Accel: ''},
    properties: {Hint: 'Show Properties', Accel: '<Control>I'},
    showinfiles: {Hint: 'Show in Files', Accel: ''},
    openinterminal: {Hint: 'Open in Terminal', Accel: ''},
    makeLinks: {Hint: 'Create Link to Item', Accel: '<Shift><Control>M'},
    bulkCopy: {Hint: 'Copy to', Accel: ''},
    bulkMove: {Hint: 'Move to', Accel: ''},
    onScriptClicked: {Hint: 'Run Script', Accel: ''},
};

// Following Global shortcuts will be added for editing and are editable
// However we need to add the key - the actioinName in lowercase to schemas
// for this to work, whithout the key added, it will not work.
// For example, for the one below, togglevisibility key added as {as} gvariant
// The program will automatically look for the lowercase key in schemas by
// converting the actionName.toLowerCase().

export const GlobalShortcuts = {
    toggleVisibility: DefaultShortcuts.toggleVisibility,
};
