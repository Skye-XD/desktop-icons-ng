project('gtk4-ding',
  version: '1',
  license: 'GPL3'
)

app_id = 'com.desktop.ding'
extension_id = 'gtk4-ding@skye-xd.github.io'
app_dir = 'app'

gnome = import ('gnome')
i18n = import('i18n')

prefix = get_option('prefix')
datadir = join_paths (prefix, get_option('datadir'))

extensions_dir = join_paths(prefix, datadir, 'gnome-shell', 'extensions', extension_id)

install_data([
    'dingManager.js',
    'windowTypeManager.js',
    'extension.js',
    'metadata.json',
    'prefs.js',
    'visibleArea.js',
    'gnomeShellOverride.js'
  ],
  install_dir: extensions_dir
)

install_subdir(
  'app',
  install_dir: join_paths(extensions_dir, app_dir),
  strip_directory: true
)

install_subdir(
  'utils',  install_dir: extensions_dir
)

install_subdir(
  'dependencies',  install_dir: extensions_dir
)

subdir(
  'data'
)

subdir(
  'po'
)

subdir(
  'schemas'
)

subdir(
  'apparmor'
)

if prefix.startswith('/usr')
    meson.add_install_script(
        'scripts/reload-apparmor.sh',
        skip_if_destdir: true
    )
endif
