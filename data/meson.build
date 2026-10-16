desktop_file_dir = join_paths(datadir, 'applications')

desktop_configured = configure_file(
  input: 'com.desktop.ding.desktop.in',
  output: 'com.desktop.ding.desktop.configured.in',
  configuration: {'EXTENSION_ID': extension_id},
)

desktop_merged = i18n.merge_file(
  input: desktop_configured,
  output: 'com.desktop.ding.desktop',
  po_dir: join_paths(meson.project_source_root(), 'po'),
  type: 'desktop',
  install: true,
  install_dir: desktop_file_dir,
)

gnome.post_install(
  update_desktop_database: true,
)

# No source_dir: meson then searches the dependencies' build dir before this
# source dir, so the merged .desktop (with this build's extension_id) wins
# over the stale upstream copy committed next to the .xml.
gnome.compile_resources(
  app_id + '.data',
  app_id + '.data.gresource.xml',
  dependencies: [ desktop_merged ],
  gresource_bundle: true,
  install: true,
  install_dir: join_paths(extensions_dir, app_dir),
)

subdir('icons')
