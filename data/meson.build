glib_compile_resources = find_program('glib-compile-resources')

desktop_file_dir = join_paths(datadir, 'applications')

install_data([
	'com.desktop.ding.desktop',
],
install_dir: desktop_file_dir
)

gnome.post_install(
  update_desktop_database: true,
)

gnome.compile_resources(
	app_id + '.data',
	app_id + '.data.gresource.xml',
	gresource_bundle: true,
	install: true,
	install_dir: join_paths(extensions_dir, app_dir)
)

subdir(
	'icons'
)