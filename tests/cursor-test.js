imports.gi.versions.Gtk = '4.0';
imports.gi.versions.Gdk = '4.0';
const {Gtk, Gdk, Gio, GObject} = imports.gi;

const cursorName = 'hand'; // Change this to a named cursor to test fallback behavior
const app = new Gtk.Application();

app.connect('activate', () => {
    print(`GDK backend: ${GObject.type_name(Gdk.Display.get_default().constructor.$gtype)}`);
    print(`Requested cursor: ${cursorName}`);
    const settings = new Gio.Settings({schema_id: 'org.gnome.desktop.interface'});
    print(`org.gnome.desktop.interface cursor-size: ${settings.get_int('cursor-size')}`);

    const window = new Gtk.ApplicationWindow({
        application: app,
        title: 'Named cursor fallback test',
        default_width: 500,
        default_height: 300,
    });
    const area = new Gtk.Label({
        label: 'Move the pointer here\nRequested cursor: hand',
        hexpand: true,
        vexpand: true,
    });
    area.set_cursor_from_name(cursorName);
    window.set_child(area);
    window.present();
});

app.run(ARGV);
