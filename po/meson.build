stystem_localedir = join_paths(prefix, 'share/locale')
user_localedir = join_paths(prefix, 'share', 'gnome-shell', 'extensions', extension_id, 'locale')

localedir = prefix.startswith('/usr') ? stystem_localedir : user_localedir

i18n.gettext (
    meson.project_name (),
    preset: 'glib',
    install_dir: localedir
)
