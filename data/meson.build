glib_compile_resources = find_program('glib-compile-resources')

gnome.compile_resources(
	APP_ID + '.data',
	APP_ID + '.data.gresource.xml',
	gresource_bundle: true,
	install: true,
	install_dir: extensions_dir / 'app'
)