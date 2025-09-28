desktop_file_dir = join_paths(datadir, 'applications')

desktop_merged = i18n.merge_file(
  input: 'com.desktop.ding.desktop.in',
  output: 'com.desktop.ding.desktop',
  po_dir: join_paths(meson.project_source_root(), 'po'),
  type: 'desktop',
  install: true,
  install_dir: desktop_file_dir,
)

gnome.post_install(
  update_desktop_database: true,
)

gnome.compile_resources(
  app_id + '.data',
  app_id + '.data.gresource.xml',
  source_dir: meson.current_source_dir(),
  extra_args: ['--sourcedir=' + meson.current_build_dir()],
  dependencies: [ desktop_merged ],
  gresource_bundle: true,
  install: true,
  install_dir: join_paths(extensions_dir, app_dir),
)

subdir('icons')
