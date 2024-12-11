glib_compile_resources = find_program('glib-compile-resources')

gnome.compile_resources(
	app_id + '.data',
	app_id + '.data.gresource.xml',
	gresource_bundle: true,
	install: true,
	install_dir: join_paths(extensions_dir, app_dir)
)