import Adw from 'gi://Adw';
import Clutter from 'gi://Clutter';
import Gdk from 'gi://Gdk?version=4.0';
import GdkPixbuf from 'gi://GdkPixbuf';
import GdkWayland from 'gi://GdkWayland?version=4.0';
import GdkX11 from 'gi://GdkX11?version=4.0';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GnomeDesktop from 'gi://GnomeDesktop?version=4.0';
const GnomeAutoar = await import('gi://GnomeAutoar').then(module => module.default).catch(logError);
import GObject from 'gi://GObject';
import Graphene from 'gi://Graphene';
import Gsk from 'gi://Gsk';
import Gtk from 'gi://Gtk';
import Meta from 'gi://Meta';
import Pango from 'gi://Pango';
import Shell from 'gi://Shell';

export {
    Adw,
    Clutter,
    Gdk,
    GdkPixbuf,
    GdkX11,
    GdkWayland,
    GLib,
    GnomeDesktop,
    GnomeAutoar,
    GObject,
    Gio,
    Graphene,
    Gsk,
    Gtk,
    Meta,
    Pango,
    Shell
};
