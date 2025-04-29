stystem_localedir = join_paths(datadir, 'locale')
user_localedir = join_paths(extensions_dir, 'locale')

localedir = prefix.startswith('/usr') ? stystem_localedir : user_localedir

i18n.gettext (
    meson.project_name (),
    preset: 'glib',
    install_dir: localedir
)
